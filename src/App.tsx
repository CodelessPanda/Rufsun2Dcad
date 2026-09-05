import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type Konva from "konva";
import { api, ApiError, getAccessToken } from "./api/client";
import type { ApiUser, CloudProject, CompanyCommercialSummary, CompanyRole, CreateCustomerInput, Customer, Invitation, MembershipStatus, SeatType, SupportModeContext, Tenant, Workspace, WorkspaceMember, WorkspaceSummary } from "./api/types";
import { PlatformAdminPage } from "./components/admin/PlatformAdminPage";
import { AuthScreen } from "./components/auth/AuthScreen";
import { PasswordResetScreen, VerifyEmailScreen } from "./components/auth/TokenActionScreens";
import { CadCanvas } from "./components/canvas/CadCanvas";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { CustomerDetailPage } from "./components/customers/CustomerDetailPage";
import { CustomersPage } from "./components/customers/CustomersPage";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { NewProjectDialog } from "./components/home/NewProjectDialog";
import { EnergyAnalysisPanel } from "./components/analysis/EnergyAnalysisPanel";
import { ContextMenu } from "./components/layout/ContextMenu";
import { LeftToolbar } from "./components/layout/LeftToolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { TopBar } from "./components/layout/TopBar";
import { PropertiesPanel } from "./components/panels/PropertiesPanel";
import { ProjectsPage } from "./components/projects/ProjectsPage";
import { TeamPage } from "./components/workspace/TeamPage";
import { TenantCompaniesPage } from "./components/tenants/TenantCompaniesPage";
import { ProfilePage } from "./components/workspace/ProfilePage";
import { WorkspaceOnboarding } from "./components/workspace/WorkspaceOnboarding";
import { type AppView, WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { WorkspaceSettingsPage } from "./components/workspace/WorkspaceSettingsPage";
import { createBlankDocument } from "./cad/document/defaultDocument";
import { cacheCloudProject, deleteProject as deleteLocalProject, listProjects, loadProject, saveProject, type SavedProject } from "./persistence/db";
import { documentSchema } from "./schemas/documentSchema";
import { useCadStore } from "./store/useCadStore";
import type { ProjectSolarDataState } from "./cad/solar/solarExposureTypes";
import {
  applySolarRegistrationToState,
  DEFAULT_SOLAR_DEBUG_LAYERS,
  updateSolarDebugLayers
} from "./services/solarExposureState";
import { normalizeSolarRegistration } from "./cad/solar/solarGeoTransform";
import type { MapCaptureSettings, RufsunCadDocument, SolarRegistration } from "./types/cad";

export type ViewMode = "editor" | "energy";
type AuthMode = "login" | "register";
type CloudSaveStatus = "idle" | "saving" | "saved" | "offline" | "error";
const DEFAULT_SOLAR_EXPOSURE_OPACITY = 1;

interface NewProjectInput {
  customer: Customer;
  projectName: string;
  installationAddress: string;
  mapCapture?: MapCaptureSettings;
  placeId?: string;
  latitude?: number;
  longitude?: number;
}

export function App() {
  const stageRef = useRef<Konva.Stage>(null);
  const cloudRetryRef = useRef<number | null>(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState<ApiUser | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => localStorage.getItem("rufsun.activeWorkspaceId") || "");
  const [activeTenantId, setActiveTenantId] = useState(() => localStorage.getItem("rufsun.activeTenantId") || "");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [appView, setAppView] = useState<AppView>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [localProjects, setLocalProjects] = useState<SavedProject[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary | undefined>();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [companyInvitations, setCompanyInvitations] = useState<Invitation[]>([]);
  const [companyCommercial, setCompanyCommercial] = useState<CompanyCommercialSummary | null>(null);
  const [supportMode, setSupportMode] = useState<SupportModeContext | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<CloudSaveStatus>("idle");
  const [solarExposure, setSolarExposure] = useState<ProjectSolarDataState>({
    status: "idle",
    visible: true,
    opacity: DEFAULT_SOLAR_EXPOSURE_OPACITY,
    debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(() => localStorage.getItem("rufsun.googleMapsApiKey") ?? "");
  // Panel identification: shared between EnergyAnalysisPanel and CadCanvas
  const [panelIndexMap, setPanelIndexMap] = useState<Record<string, number>>({});
  const [highlightedPanelId, setHighlightedPanelId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("rufsun.panelWidth"));
    return saved >= 280 && saved <= 1600 ? saved : 310;
  });

  const document = useCadStore((state) => state.document);
  const setDocument = useCadStore((state) => state.setDocument);
  const setAutosaveStatus = useCadStore((state) => state.setAutosaveStatus);
  const deleteSelected = useCadStore((state) => state.deleteSelected);
  const copySelected = useCadStore((state) => state.copySelected);
  const paste = useCadStore((state) => state.paste);
  const duplicateSelected = useCadStore((state) => state.duplicateSelected);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const setDraft = useCadStore((state) => state.setDraft);
  const setGuides = useCadStore((state) => state.setGuides);
  const toast = useCadStore((state) => state.toast);

  const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId) ?? tenants.find((tenant) => tenant.id === workspaces[0]?.tenantId) ?? tenants[0];
  const tenantWorkspaces = activeTenant ? workspaces.filter((workspace) => workspace.tenantId === activeTenant.id) : workspaces;
  const activeWorkspace = tenantWorkspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? tenantWorkspaces[0] ?? workspaces[0];
  const inviteToken = window.location.pathname.startsWith("/invite/") ? decodeURIComponent(window.location.pathname.replace("/invite/", "")) : "";
  const resetToken = window.location.pathname.startsWith("/reset-password/") ? decodeURIComponent(window.location.pathname.replace("/reset-password/", "")) : "";
  const verifyEmailToken = window.location.pathname.startsWith("/verify-email/") ? decodeURIComponent(window.location.pathname.replace("/verify-email/", "")) : "";

  useEffect(() => {
    localStorage.setItem("rufsun.panelWidth", String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    if (activeWorkspaceId) localStorage.setItem("rufsun.activeWorkspaceId", activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (activeTenantId) localStorage.setItem("rufsun.activeTenantId", activeTenantId);
  }, [activeTenantId]);

  useEffect(() => {
    if (!activeTenant || activeWorkspace?.tenantId === activeTenant.id) return;
    const nextCompany = workspaces.find((workspace) => workspace.tenantId === activeTenant.id);
    setActiveWorkspaceId(nextCompany?.id ?? "");
    setCustomers([]);
    setProjects([]);
    setMembers([]);
    setCompanyInvitations([]);
    setCompanyCommercial(null);
    setSelectedCustomer(null);
    setActiveProjectId(null);
  }, [activeTenant, activeWorkspace?.tenantId, workspaces]);

  useEffect(() => {
    const onResize = () => {
      setPanelWidth((width) => Math.min(width, Math.max(280, window.innerWidth - 76)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!activeWorkspace?.id || !user) return;
    void refreshWorkspaceData(activeWorkspace.id);
  }, [activeWorkspace?.id, user]);

  useEffect(() => {
    if (viewMode === "energy") {
      setDraft(null);
      setGuides([]);
    }
  }, [viewMode, setDraft, setGuides]);

  useEffect(() => {
    if (appView !== "designer" || !activeProjectId || !activeWorkspaceId) return;
    setAutosaveStatus("saving");
    setCloudSaveStatus("saving");
    const localTimeout = window.setTimeout(() => {
      void saveProject(activeProjectId, document, {
        workspaceId: activeWorkspaceId,
        cloudProjectId: activeProjectId,
        projectName: document.name,
        locallyModified: true
      })
        .then(() => setAutosaveStatus("saved"))
        .catch(() => setAutosaveStatus("error"));
    }, 500);
    const cloudTimeout = window.setTimeout(() => {
      void saveCloudDocument(activeWorkspaceId, activeProjectId, document);
    }, 2800);
    return () => {
      window.clearTimeout(localTimeout);
      window.clearTimeout(cloudTimeout);
    };
  }, [activeProjectId, activeWorkspaceId, appView, document, setAutosaveStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (appView !== "designer" || isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if ((event.key === "Delete" || event.key === "Backspace") && !ctrl) {
        deleteSelected();
        event.preventDefault();
      }
      if (!ctrl) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        copySelected();
        event.preventDefault();
      }
      if (key === "v") {
        paste();
        event.preventDefault();
      }
      if (key === "d") {
        duplicateSelected();
        event.preventDefault();
      }
      if (key === "z" && event.shiftKey) {
        redo();
        event.preventDefault();
      } else if (key === "z") {
        undo();
        event.preventDefault();
      }
      if (key === "y") {
        redo();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appView, copySelected, deleteSelected, duplicateSelected, paste, redo, undo]);

  const refreshWorkspaceData = useCallback(async (workspaceId: string) => {
    try {
      const [nextCustomers, nextProjects, nextSummary, nextMembers, nextLocalProjects] = await Promise.all([
        api.customers(workspaceId),
        api.projects(workspaceId),
        api.workspaceSummary(workspaceId),
        api.companyMembers(workspaceId),
        listProjects()
      ]);
      setCustomers(nextCustomers);
      setProjects(nextProjects);
      setSummary(nextSummary);
      setMembers(nextMembers.members);
      setCompanyInvitations(nextMembers.invitations);
      try {
        setCompanyCommercial(await api.companyLicensing(workspaceId));
      } catch {
        setCompanyCommercial(null);
      }
      setLocalProjects(nextLocalProjects);
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(formatError(error));
    }
  }, []);

  const restoreSession = async () => {
    setBooting(true);
    try {
      if (!getAccessToken()) return;
      const nextUser = await api.me();
      const [nextTenants, nextWorkspaces] = await Promise.all([api.tenants(), api.workspaces()]);
      setUser(nextUser);
      setTenants(nextTenants);
      setWorkspaces(nextWorkspaces);
      const savedWorkspace = nextWorkspaces.find((workspace) => workspace.id === activeWorkspaceId);
      const savedTenant = nextTenants.find((tenant) => tenant.id === activeTenantId);
      const nextCompany = savedWorkspace ?? nextWorkspaces[0];
      const nextTenant = savedTenant ?? nextTenants.find((tenant) => tenant.id === nextCompany?.tenantId) ?? nextTenants[0];
      setActiveTenantId(nextTenant?.id ?? "");
      setActiveWorkspaceId((savedWorkspace ?? nextWorkspaces[0])?.id ?? "");
      if (nextUser.platformRole === "super_admin" && !nextCompany) setAppView("platform");
    } catch {
      setUser(null);
      setTenants([]);
      setWorkspaces([]);
    } finally {
      setBooting(false);
      setLocalProjects(await listProjects());
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await api.login({ email, password });
      if (inviteToken) await api.acceptInvitation(inviteToken);
      await restoreSession();
    } catch (error) {
      setAuthError(formatError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await api.register({ name, email, password, invitationToken: inviteToken || undefined });
      await restoreSession();
    } catch (error) {
      setAuthError(formatError(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setTenants([]);
    setWorkspaces([]);
    setSupportMode(null);
    setActiveWorkspaceId("");
    setActiveTenantId("");
    setAppView("dashboard");
    setActiveProjectId(null);
  };

  const createWorkspace = async (name: string) => {
    setWorkspaceBusy(true);
    setWorkspaceError("");
    try {
      const workspace = await api.createWorkspace({ name });
      const [nextTenants, nextWorkspaces] = await Promise.all([api.tenants(), api.workspaces()]);
      setTenants(nextTenants);
      setWorkspaces(nextWorkspaces);
      setActiveTenantId(workspace.tenantId);
      setActiveWorkspaceId(workspace.id);
      setAppView("dashboard");
    } catch (error) {
      setWorkspaceError(formatError(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const refreshSaasContext = async () => {
    const [nextTenants, nextWorkspaces] = await Promise.all([api.tenants(), api.workspaces()]);
    setTenants(nextTenants);
    setWorkspaces(nextWorkspaces);
    const validCompany = nextWorkspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? nextWorkspaces[0];
    const validTenant = nextTenants.find((tenant) => tenant.id === activeTenantId) ?? nextTenants.find((tenant) => tenant.id === validCompany?.tenantId) ?? nextTenants[0];
    setActiveTenantId(validTenant?.id ?? "");
    setActiveWorkspaceId(validCompany?.id ?? "");
  };

  const enterSupportMode = async (companyId: string) => {
    const context = await api.enterSupportMode(companyId);
    setSupportMode(context);
    setTenants((current) => (current.some((tenant) => tenant.id === context.tenant.id) ? current : [...current, context.tenant]));
    setWorkspaces((current) => (current.some((workspace) => workspace.id === context.company.id) ? current : [...current, context.company]));
    setActiveTenantId(context.tenant.id);
    setActiveWorkspaceId(context.company.id);
    setSelectedCustomer(null);
    setActiveProjectId(null);
    setCustomers([]);
    setProjects([]);
    setMembers([]);
    setCompanyInvitations([]);
    setCompanyCommercial(null);
    setSummary(undefined);
    setAppView("dashboard");
    await refreshWorkspaceData(context.company.id);
  };

  const exitSupportMode = async () => {
    await api.exitSupportMode().catch(() => undefined);
    setSupportMode(null);
    await refreshSaasContext();
    setAppView("platform");
  };

  const handleTenantChange = (tenantId: string) => {
    const nextCompany = workspaces.find((workspace) => workspace.tenantId === tenantId);
    setActiveTenantId(tenantId);
    setActiveWorkspaceId(nextCompany?.id ?? "");
    setSelectedCustomer(null);
    setActiveProjectId(null);
    setCustomers([]);
    setProjects([]);
    setMembers([]);
    setCompanyInvitations([]);
    setCompanyCommercial(null);
    setSummary(undefined);
    setAppView(nextCompany ? "dashboard" : "tenant");
  };

  const handleCompanyChange = (workspaceId: string) => {
    const nextCompany = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!nextCompany) return;
    setActiveTenantId(nextCompany.tenantId);
    setActiveWorkspaceId(workspaceId);
    setSelectedCustomer(null);
    setActiveProjectId(null);
    setCustomers([]);
    setProjects([]);
    setMembers([]);
    setCompanyInvitations([]);
    setCompanyCommercial(null);
    setSummary(undefined);
    setAppView("dashboard");
  };

  const inviteCompanyMember = async (input: { email: string; role: CompanyRole; seatType: SeatType }) => {
    if (!activeWorkspaceId) return;
    await api.inviteCompanyMember(activeWorkspaceId, input);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const updateCompanyMember = async (membershipId: string, input: { role?: CompanyRole; seatType?: SeatType; status?: MembershipStatus }) => {
    if (!activeWorkspaceId) return;
    await api.updateCompanyMember(activeWorkspaceId, membershipId, input);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const removeCompanyMember = async (membershipId: string) => {
    if (!activeWorkspaceId) return;
    await api.removeCompanyMember(activeWorkspaceId, membershipId);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const revokeCompanyInvitation = async (invitationId: string) => {
    if (!activeWorkspaceId) return;
    await api.revokeCompanyInvitation(activeWorkspaceId, invitationId);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const createCustomer = async (input: CreateCustomerInput) => {
    if (!activeWorkspaceId) throw new Error("No active workspace");
    const customer = await api.createCustomer(activeWorkspaceId, input);
    await refreshWorkspaceData(activeWorkspaceId);
    return customer;
  };

  const updateCustomer = async (customerId: string, input: Partial<CreateCustomerInput>) => {
    if (!activeWorkspaceId) return;
    await api.updateCustomer(activeWorkspaceId, customerId, input);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const archiveCustomer = async (customerId: string) => {
    if (!activeWorkspaceId) return;
    await api.archiveCustomer(activeWorkspaceId, customerId);
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const openCustomer = async (customerId: string) => {
    if (!activeWorkspaceId) return;
    setSelectedCustomer(await api.customer(activeWorkspaceId, customerId));
    setAppView("customer");
  };

  const openNewProject = (customerId?: string | null) => {
    setPreselectedCustomerId(customerId ?? null);
    setNewProjectOpen(true);
  };

  const makeProject = async (input: NewProjectInput) => {
    if (!activeWorkspaceId) return;
    setProjectBusy(true);
    try {
      const cadDocument = createBlankDocument(input.projectName, input.customer.name, input.installationAddress, input.mapCapture);
      const project = await api.createProject(activeWorkspaceId, {
        customerId: input.customer.id,
        name: input.projectName,
        address: input.installationAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        placeId: input.placeId,
        documentJson: cadDocument,
        schemaVersion: "1"
      });
      await cacheCloudProject(activeWorkspaceId, project.id, cadDocument, {
        customerId: input.customer.id,
        projectName: project.name,
        status: project.status,
        cloudSavedAt: new Date().toISOString()
      });
      setDocument(cadDocument, false);
      setActiveProjectId(project.id);
      setSolarExposure({
        status: "idle",
        visible: true,
        opacity: DEFAULT_SOLAR_EXPOSURE_OPACITY,
        debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
        registration: cadDocument.solarRegistration
      });
      setViewMode("editor");
      setCloudSaveStatus("saved");
      setAppView("designer");
      setNewProjectOpen(false);
      await refreshWorkspaceData(activeWorkspaceId);
    } finally {
      setProjectBusy(false);
    }
  };

  const openCloudProject = async (projectId: string) => {
    if (!activeWorkspaceId) return;
    try {
      const cloudDocument = await api.document(activeWorkspaceId, projectId);
      const parsed = documentSchema.safeParse(cloudDocument.documentJson);
      if (!parsed.success) {
        window.alert("Project document could not be opened.");
        return;
      }
      setDocument(parsed.data, false);
      await cacheCloudProject(activeWorkspaceId, projectId, parsed.data, { cloudSavedAt: cloudDocument.updatedAt });
      setActiveProjectId(projectId);
      setSolarExposure({
        status: "idle",
        visible: true,
        opacity: DEFAULT_SOLAR_EXPOSURE_OPACITY,
        debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
        registration: parsed.data.solarRegistration
      });
      setViewMode("editor");
      setCloudSaveStatus("saved");
      setAppView("designer");
    } catch (error) {
      const localDocument = await loadProject(projectId);
      if (localDocument) {
        setDocument(localDocument, false);
        setActiveProjectId(projectId);
        setSolarExposure({
          status: "idle",
          visible: true,
          opacity: DEFAULT_SOLAR_EXPOSURE_OPACITY,
          debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
          registration: localDocument.solarRegistration
        });
        setViewMode("editor");
        setCloudSaveStatus("offline");
        setAppView("designer");
        return;
      }
      window.alert(formatError(error));
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!activeWorkspaceId) return;
    try {
      await api.archiveProject(activeWorkspaceId, projectId);
      await deleteLocalProject(projectId);
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
        setAppView("projects");
      }
      await refreshWorkspaceData(activeWorkspaceId);
    } catch (error) {
      window.alert(formatError(error));
    }
  };

  const importLocalProjects = async () => {
    if (!activeWorkspaceId || localProjects.length === 0) return;
    const customer = customers[0] ?? (await createCustomer({ name: "Imported Local Projects" }));
    for (const localProject of localProjects.filter((project) => !project.cloudProjectId)) {
      await api.createProject(activeWorkspaceId, {
        customerId: customer.id,
        name: localProject.document.name,
        address: localProject.address,
        documentJson: localProject.document,
        schemaVersion: "1"
      });
    }
    await refreshWorkspaceData(activeWorkspaceId);
  };

  const saveCloudDocument = async (workspaceId: string, projectId: string, cadDocument: RufsunCadDocument) => {
    try {
      const saved = await api.saveDocument(workspaceId, projectId, cadDocument);
      await cacheCloudProject(workspaceId, projectId, cadDocument, {
        projectName: cadDocument.name,
        locallyModified: false,
        cloudSavedAt: saved.updatedAt
      });
      setCloudSaveStatus("saved");
      setAutosaveStatus("saved");
      if (cloudRetryRef.current) window.clearTimeout(cloudRetryRef.current);
      void refreshWorkspaceData(workspaceId);
    } catch {
      setCloudSaveStatus(navigator.onLine ? "error" : "offline");
      setAutosaveStatus("error");
      if (cloudRetryRef.current) window.clearTimeout(cloudRetryRef.current);
      cloudRetryRef.current = window.setTimeout(() => {
        void saveCloudDocument(workspaceId, projectId, useCadStore.getState().document);
      }, 10000);
    }
  };

  const saveGoogleMapsApiKey = (apiKey: string) => {
    const trimmed = apiKey.trim();
    localStorage.setItem("rufsun.googleMapsApiKey", trimmed);
    setGoogleMapsApiKey(trimmed);
  };

  const loadSolarExposure = async () => {
    if (!activeWorkspaceId || !activeProjectId) {
      setSolarExposure((current) => ({
        ...current,
        status: "error",
        error: "Open a cloud project before loading solar exposure."
      }));
      return;
    }
    const opacity = solarExposure.opacity || DEFAULT_SOLAR_EXPOSURE_OPACITY;
    setSolarExposure((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      setSolarExposure(
        await (await import("./services/googleSolar")).loadProjectSolarExposure({
          workspaceId: activeWorkspaceId,
          projectId: activeProjectId,
          mapCapture: document.mapCapture,
          opacity,
          googleApiKey: googleMapsApiKey,
          registration: document.solarRegistration
        })
      );
    } catch (error) {
      setSolarExposure((current) => ({
        ...current,
        status: "error",
        error: formatError(error)
      }));
    }
  };

  const updateSolarRegistration = (patch: Partial<SolarRegistration>, calibrated = false) => {
    const currentRegistration = normalizeSolarRegistration({
      ...document.solarRegistration,
      ...solarExposure.registration
    });
    const nextRegistration = normalizeSolarRegistration({
      ...currentRegistration,
      ...patch,
      calibrated: Object.prototype.hasOwnProperty.call(patch, "calibrated") ? Boolean(patch.calibrated) : calibrated || currentRegistration.calibrated
    });
    setDocument({ ...document, solarRegistration: nextRegistration });
    setSolarExposure((current) => applySolarRegistrationToState(current, document.mapCapture, nextRegistration));
  };

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const maxWidth = Math.max(280, window.innerWidth - 76);
    const onMove = (moveEvent: MouseEvent) => {
      setPanelWidth(Math.min(maxWidth, Math.max(280, startWidth + (startX - moveEvent.clientX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      globalThis.document.body.style.cursor = "";
    };
    globalThis.document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (booting) return <div className="loading-screen">Loading RufsunCAD...</div>;
  if (resetToken) return <PasswordResetScreen token={resetToken} />;
  if (verifyEmailToken) return <VerifyEmailScreen token={verifyEmailToken} />;
  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        busy={authBusy}
        error={authError}
        onModeChange={setAuthMode}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onForgotPassword={async (email) => {
          await api.forgotPassword(email);
        }}
      />
    );
  }
  if (!activeWorkspace) {
    if (user.platformRole === "super_admin") {
      return (
        <ErrorBoundary>
          <PlatformAdminPage onChanged={refreshSaasContext} onLogout={handleLogout} onEnterSupportMode={enterSupportMode} />
        </ErrorBoundary>
      );
    }
    return <WorkspaceOnboarding busy={workspaceBusy} error={workspaceError} onCreateWorkspace={createWorkspace} onLogout={handleLogout} />;
  }

  if (appView === "designer") {
    return (
      <ErrorBoundary>
        <div className="app-shell">
          <TopBar
            stageRef={stageRef}
            onShowProjects={() => {
              setAppView("projects");
              void refreshWorkspaceData(activeWorkspace.id);
            }}
            cloudSaveStatus={cloudSaveStatus}
            solarExposure={solarExposure}
            onLoadSolarExposure={() => void loadSolarExposure()}
            onToggleSolarExposure={(visible) => setSolarExposure((current) => ({ ...current, visible }))}
            onUpdateSolarDebugLayers={(patch) => setSolarExposure((current) => updateSolarDebugLayers(current, patch))}
            onUpdateSolarRegistration={updateSolarRegistration}
            commercialAccess={companyCommercial}
          />
          <main className="editor-grid" style={{ "--panel-width": `${panelWidth}px` } as CSSProperties}>
            {viewMode === "editor" ? (
              <>
                <LeftToolbar viewMode={viewMode} setViewMode={setViewMode} />
                <CadCanvas stageRef={stageRef} solarExposure={solarExposure} />
                <div className="panel-resize-handle" onMouseDown={startResize} />
                <PropertiesPanel commercialAccess={companyCommercial} solarExposure={solarExposure} />
              </>
            ) : (
              <>
                <LeftToolbar viewMode={viewMode} setViewMode={setViewMode} />
                <CadCanvas
                  stageRef={stageRef}
                  readOnly
                  solarExposure={solarExposure}
                  panelIndexMap={panelIndexMap}
                  highlightedPanelId={highlightedPanelId}
                />
                <div className="panel-resize-handle" onMouseDown={startResize} />
                <EnergyAnalysisPanel
                  solarExposure={solarExposure}
                  projectId={activeProjectId ?? undefined}
                  workspaceId={activeWorkspaceId ?? undefined}
                  mapCapture={document.mapCapture}
                  googleApiKey={googleMapsApiKey ?? undefined}
                  solarRegistration={solarExposure.registration}
                  onPanelIndexMapChange={setPanelIndexMap}
                  onHighlightedPanelChange={setHighlightedPanelId}
                />
              </>
            )}
          </main>
          {viewMode === "editor" && <StatusBar />}
          <ContextMenu />
          {toast && <div className="toast">{toast}</div>}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <WorkspaceShell
        user={user}
        tenants={tenants}
        workspaces={workspaces}
        activeTenant={activeTenant}
        activeWorkspace={activeWorkspace}
        activeView={appView}
        onTenantChange={handleTenantChange}
        onWorkspaceChange={handleCompanyChange}
        onCreateWorkspace={() => {
          const name = window.prompt("Company name");
          if (name?.trim()) void createWorkspace(name.trim());
        }}
        onNavigate={(view) => {
          setAppView(view);
          if (view !== "designer") setViewMode("editor");
        }}
        onLogout={handleLogout}
        supportMode={supportMode}
        onExitSupportMode={exitSupportMode}
      >
        {appView === "platform" && <PlatformAdminPage onChanged={refreshSaasContext} onEnterSupportMode={enterSupportMode} />}
        {appView === "tenant" && activeTenant && (
          <TenantCompaniesPage
            tenant={activeTenant}
            companies={tenantWorkspaces}
            activeCompanyId={activeWorkspace.id}
            onCompanyChange={handleCompanyChange}
            onChanged={refreshSaasContext}
          />
        )}
        {appView === "dashboard" && (
          <DashboardPage
            summary={summary}
            projects={projects}
            customers={customers}
            members={members}
            licensing={companyCommercial}
            onNewProject={() => openNewProject()}
            onOpenProject={(id) => void openCloudProject(id)}
          />
        )}
        {appView === "customers" && (
          <CustomersPage
            customers={customers}
            busy={projectBusy}
            onCreate={async (input) => {
              await createCustomer(input);
            }}
            onUpdate={updateCustomer}
            onArchive={archiveCustomer}
            onOpen={(id) => void openCustomer(id)}
          />
        )}
        {appView === "customer" && (
          <CustomerDetailPage
            customer={selectedCustomer}
            onBack={() => setAppView("customers")}
            onNewProject={() => openNewProject(selectedCustomer?.id)}
            onOpenProject={(id) => void openCloudProject(id)}
          />
        )}
        {appView === "projects" && (
          <>
            <ProjectsPage
              projects={projects}
              onNewProject={() => openNewProject()}
              onOpenProject={(id) => void openCloudProject(id)}
              onDeleteProject={(id) => void deleteProject(id)}
            />
            {localProjects.some((project) => !project.cloudProjectId) && (
              <div className="local-import-banner">
                <span>{localProjects.filter((project) => !project.cloudProjectId).length} local-only projects are still safely stored in this browser.</span>
                <button onClick={() => void importLocalProjects()}>Import Local Projects</button>
              </div>
            )}
          </>
        )}
        {appView === "team" && (
          <TeamPage
            members={members}
            invitations={companyInvitations}
            licensing={companyCommercial}
            activeRole={activeWorkspace.role}
            onInvite={inviteCompanyMember}
            onUpdateMember={updateCompanyMember}
            onRemoveMember={removeCompanyMember}
            onRevokeInvitation={revokeCompanyInvitation}
          />
        )}
        {appView === "settings" && (
          <WorkspaceSettingsPage
            workspace={activeWorkspace}
            busy={workspaceBusy}
            error={workspaceError}
            licensing={companyCommercial}
            onSave={async (input) => {
              setWorkspaceBusy(true);
              setWorkspaceError("");
              try {
                await api.updateCompany(activeWorkspace.id, input);
                setWorkspaces(await api.workspaces());
              } catch (error) {
                setWorkspaceError(formatError(error));
              } finally {
                setWorkspaceBusy(false);
              }
            }}
          />
        )}
        {appView === "profile" && activeTenant && (
          <ProfilePage user={user} activeTenant={activeTenant} activeWorkspace={activeWorkspace} />
        )}
      </WorkspaceShell>
      <NewProjectDialog
        open={newProjectOpen}
        busy={projectBusy}
        googleMapsApiKey={googleMapsApiKey}
        customers={customers}
        preselectedCustomerId={preselectedCustomerId}
        onCancel={() => setNewProjectOpen(false)}
        onCreateCustomer={createCustomer}
        onCreate={makeProject}
      />
      {appView === "settings" && (
        <button className="maps-key-fab" onClick={() => saveGoogleMapsApiKey(window.prompt("Google Maps / Solar API key", googleMapsApiKey) ?? googleMapsApiKey)}>
          API Key
        </button>
      )}
    </ErrorBoundary>
  );
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function formatError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
