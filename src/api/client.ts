import type {
  ApiUser,
  CloudDocument,
  CloudProject,
  Company,
  CompanyCommercialSummary,
  CreateCustomerInput,
  CreateProjectInput,
  Customer,
  Invitation,
  MembersResponse,
  MembershipStatus,
  Plan,
  PlanCode,
  SeatType,
  SubscriptionStatus,
  Tenant,
  TenantCommercialSummary,
  TenantMembersResponse,
  TenantRole,
  UserSession,
  Workspace,
  CompanyRole,
  WorkspaceMember,
  WorkspaceSummary,
  SolarDataLayers
} from "./types";
import type { RufsunCadDocument } from "../types/cad";

const ACCESS_TOKEN_KEY = "rufsun.accessToken";
const GOOGLE_MAPS_API_KEY = "rufsun.googleMapsApiKey";
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
  }
}

let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || "";

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string) {
  accessToken = token;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  accessToken = "";
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

async function requestJson<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 && retry && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestJson<T>(path, options, false);
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    throw new ApiError(readError(data) || response.statusText, response.status, data);
  }
  return data as T;
}

async function refreshAccessToken() {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      clearAccessToken();
      return false;
    }
    const data = (await response.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readError(data: unknown) {
  if (typeof data === "object" && data && "message" in data) {
    const message = (data as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join(", ") : message;
  }
  return undefined;
}

function googleApiKeyHeaders(apiKey?: string): Record<string, string> {
  const key = (apiKey ?? localStorage.getItem(GOOGLE_MAPS_API_KEY) ?? "").trim();
  return key ? { "X-Google-Maps-Api-Key": key } : {};
}

export const api = {
  baseUrl: API_BASE,
  async register(input: { name: string; email: string; password: string; invitationToken?: string }) {
    const data = await requestJson<{ accessToken: string; expiresIn: number }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setAccessToken(data.accessToken);
    return data;
  },
  async login(input: { email: string; password: string }) {
    const data = await requestJson<{ accessToken: string; expiresIn: number }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setAccessToken(data.accessToken);
    return data;
  },
  async logout() {
    await requestJson<{ ok: boolean }>("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearAccessToken();
  },
  me() {
    return requestJson<ApiUser>("/auth/me");
  },
  forgotPassword(email: string) {
    return requestJson<{ ok: boolean; resetUrl?: string }>("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
  },
  resetPassword(token: string, password: string) {
    return requestJson<{ ok: boolean }>("/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) });
  },
  changePassword(currentPassword: string, newPassword: string) {
    return requestJson<{ ok: boolean }>("/auth/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  },
  verifyEmail(token: string) {
    return requestJson<{ ok: boolean }>("/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) });
  },
  sessions() {
    return requestJson<UserSession[]>("/auth/sessions");
  },
  revokeOtherSessions() {
    return requestJson<{ ok: boolean }>("/auth/sessions/revoke-others", { method: "POST" });
  },
  invitation(token: string) {
    return requestJson<Invitation>(`/invitations/${encodeURIComponent(token)}`);
  },
  acceptInvitation(token: string) {
    return requestJson<Invitation>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });
  },
  tenants() {
    return requestJson<Tenant[]>("/tenants");
  },
  adminTenants() {
    return requestJson<Tenant[]>("/admin/tenants");
  },
  createAdminTenant(input: { name: string; type?: Tenant["type"] }) {
    return requestJson<Tenant>("/admin/tenants", { method: "POST", body: JSON.stringify(input) });
  },
  adminTenant(tenantId: string) {
    return requestJson<Tenant>(`/admin/tenants/${tenantId}`);
  },
  updateAdminTenant(tenantId: string, input: Partial<Pick<Tenant, "name" | "type" | "status">>) {
    return requestJson<Tenant>(`/admin/tenants/${tenantId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  commercialOverview() {
    return requestJson<Array<Tenant & { commercial: TenantCommercialSummary }>>("/admin/commercial");
  },
  commercialPlans() {
    return requestJson<Plan[]>("/admin/commercial/plans");
  },
  updateTenantSubscription(tenantId: string, input: { planCode: PlanCode; status?: SubscriptionStatus; notes?: string }) {
    return requestJson<unknown>(`/admin/tenants/${tenantId}/subscription`, { method: "PATCH", body: JSON.stringify(input) });
  },
  updateTenantSeatCapacity(tenantId: string, input: { seatType: Exclude<SeatType, "no_seat">; total?: number; unlimited?: boolean }) {
    return requestJson<unknown>(`/admin/tenants/${tenantId}/seat-capacity`, { method: "PATCH", body: JSON.stringify(input) });
  },
  tenantCompanies(tenantId: string) {
    return requestJson<Company[]>(`/tenants/${tenantId}/companies`);
  },
  tenantLicensing(tenantId: string) {
    return requestJson<TenantCommercialSummary>(`/tenants/${tenantId}/licensing`);
  },
  updateCompanySeatAllocation(tenantId: string, companyId: string, input: { seatType: Exclude<SeatType, "no_seat">; allocated?: number; unlimited?: boolean }) {
    return requestJson<unknown>(`/tenants/${tenantId}/companies/${companyId}/seat-allocation`, { method: "PATCH", body: JSON.stringify(input) });
  },
  createTenantCompany(tenantId: string, input: { name: string }) {
    return requestJson<Company>(`/tenants/${tenantId}/companies`, { method: "POST", body: JSON.stringify(input) });
  },
  company(companyId: string) {
    return requestJson<Company>(`/companies/${companyId}`);
  },
  updateCompany(companyId: string, input: Partial<Company>) {
    return requestJson<Company>(`/companies/${companyId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  workspaces() {
    return requestJson<Workspace[]>("/workspaces");
  },
  createWorkspace(input: { name: string }) {
    return requestJson<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(input) });
  },
  workspaceSummary(workspaceId: string) {
    return requestJson<WorkspaceSummary>(`/workspaces/${workspaceId}/summary`);
  },
  updateWorkspace(workspaceId: string, input: Partial<Workspace>) {
    return requestJson<Workspace>(`/workspaces/${workspaceId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  members(workspaceId: string) {
    return requestJson<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
  },
  companyMembers(companyId: string) {
    return requestJson<MembersResponse>(`/companies/${companyId}/members`);
  },
  companyLicensing(companyId: string) {
    return requestJson<CompanyCommercialSummary>(`/companies/${companyId}/licensing`);
  },
  inviteCompanyMember(companyId: string, input: { email: string; role: CompanyRole; seatType: SeatType }) {
    return requestJson<Invitation>(`/companies/${companyId}/invitations`, { method: "POST", body: JSON.stringify(input) });
  },
  updateCompanyMember(companyId: string, membershipId: string, input: { role?: CompanyRole; seatType?: SeatType; status?: MembershipStatus }) {
    return requestJson<WorkspaceMember>(`/companies/${companyId}/members/${membershipId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  removeCompanyMember(companyId: string, membershipId: string) {
    return requestJson<WorkspaceMember>(`/companies/${companyId}/members/${membershipId}`, { method: "DELETE" });
  },
  revokeCompanyInvitation(companyId: string, invitationId: string) {
    return requestJson<Invitation>(`/companies/${companyId}/invitations/${invitationId}`, { method: "DELETE" });
  },
  tenantMembers(tenantId: string) {
    return requestJson<TenantMembersResponse>(`/tenants/${tenantId}/members`);
  },
  inviteTenantMember(tenantId: string, input: { email: string; role: TenantRole }) {
    return requestJson<Invitation>(`/tenants/${tenantId}/invitations`, { method: "POST", body: JSON.stringify(input) });
  },
  updateTenantMember(tenantId: string, membershipId: string, input: { role?: TenantRole; status?: MembershipStatus }) {
    return requestJson<TenantMembersResponse["members"][number]>(`/tenants/${tenantId}/members/${membershipId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  removeTenantMember(tenantId: string, membershipId: string) {
    return requestJson<TenantMembersResponse["members"][number]>(`/tenants/${tenantId}/members/${membershipId}`, { method: "DELETE" });
  },
  revokeTenantInvitation(tenantId: string, invitationId: string) {
    return requestJson<Invitation>(`/tenants/${tenantId}/invitations/${invitationId}`, { method: "DELETE" });
  },
  customers(workspaceId: string, search = "") {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    return requestJson<Customer[]>(`/companies/${workspaceId}/customers${query}`);
  },
  createCustomer(workspaceId: string, input: CreateCustomerInput) {
    return requestJson<Customer>(`/companies/${workspaceId}/customers`, { method: "POST", body: JSON.stringify(input) });
  },
  customer(workspaceId: string, customerId: string) {
    return requestJson<Customer>(`/companies/${workspaceId}/customers/${customerId}`);
  },
  updateCustomer(workspaceId: string, customerId: string, input: Partial<CreateCustomerInput>) {
    return requestJson<Customer>(`/companies/${workspaceId}/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  archiveCustomer(workspaceId: string, customerId: string) {
    return requestJson<Customer>(`/companies/${workspaceId}/customers/${customerId}/archive`, { method: "POST" });
  },
  projects(workspaceId: string) {
    return requestJson<CloudProject[]>(`/companies/${workspaceId}/projects`);
  },
  createProject(workspaceId: string, input: CreateProjectInput) {
    return requestJson<CloudProject>(`/companies/${workspaceId}/projects`, { method: "POST", body: JSON.stringify(input) });
  },
  project(workspaceId: string, projectId: string) {
    return requestJson<CloudProject>(`/companies/${workspaceId}/projects/${projectId}`);
  },
  archiveProject(workspaceId: string, projectId: string) {
    return requestJson<CloudProject>(`/companies/${workspaceId}/projects/${projectId}/archive`, { method: "POST" });
  },
  document(workspaceId: string, projectId: string) {
    return requestJson<CloudDocument>(`/companies/${workspaceId}/projects/${projectId}/document`);
  },
  saveDocument(workspaceId: string, projectId: string, documentJson: RufsunCadDocument) {
    return requestJson<CloudDocument>(`/companies/${workspaceId}/projects/${projectId}/document`, {
      method: "PUT",
      body: JSON.stringify({ documentJson, schemaVersion: "1" })
    });
  },
  solarDataLayers(workspaceId: string, projectId: string, googleApiKey?: string) {
    return requestJson<SolarDataLayers>(`/companies/${workspaceId}/projects/${projectId}/solar/data-layers`, {
      headers: googleApiKeyHeaders(googleApiKey)
    });
  },
  async solarAnnualFluxTiff(workspaceId: string, projectId: string, googleApiKey?: string) {
    return this.solarLayerTiff(workspaceId, projectId, "annual-flux", googleApiKey);
  },
  async solarLayerTiff(workspaceId: string, projectId: string, layer: "annual-flux" | "rgb" | "dsm" | "mask", googleApiKey?: string) {
    const path = layer === "annual-flux" ? "annual-flux.tiff" : `layers/${layer}.tiff`;
    const response = await fetch(`${API_BASE}/companies/${workspaceId}/projects/${projectId}/solar/${path}`, {
      credentials: "include",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...googleApiKeyHeaders(googleApiKey)
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(text || "Unable to download annual solar flux GeoTIFF.", response.status, text);
    }
    return response.arrayBuffer();
  }
};
