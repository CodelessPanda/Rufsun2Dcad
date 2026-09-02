import { Building2, ChevronDown, LayoutDashboard, LifeBuoy, LogOut, Settings, Users, UserRound, FolderOpen, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { can, UiPermissions } from "../../authz/permissions";
import type { ApiUser, SupportModeContext, Tenant, Workspace } from "../../api/types";

export type AppView = "platform" | "tenant" | "dashboard" | "customers" | "customer" | "projects" | "designer" | "team" | "settings" | "profile";

interface Props {
  user: ApiUser;
  tenants: Tenant[];
  workspaces: Workspace[];
  activeTenant?: Tenant;
  activeWorkspace: Workspace;
  activeView: AppView;
  children: ReactNode;
  onTenantChange: (tenantId: string) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onNavigate: (view: AppView) => void;
  onLogout: () => Promise<void>;
  supportMode?: SupportModeContext | null;
  onExitSupportMode?: () => Promise<void>;
}

export function WorkspaceShell({
  user,
  tenants,
  workspaces,
  activeTenant,
  activeWorkspace,
  activeView,
  children,
  onTenantChange,
  onWorkspaceChange,
  onCreateWorkspace,
  onNavigate,
  onLogout,
  supportMode,
  onExitSupportMode
}: Props) {
  return (
    <div className="saas-shell">
      <aside className="saas-sidebar">
        <div className="brand saas-brand">
          <span className="brand-mark">R</span>
          <strong>RufsunCAD</strong>
        </div>
        {tenants.length > 0 && (
          <label className="workspace-switcher">
            <span>Tenant</span>
            <select value={activeTenant?.id ?? ""} onChange={(event) => onTenantChange(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
        )}
        <label className="workspace-switcher">
          <span>Company</span>
          <select value={activeWorkspace.id} onChange={(event) => onWorkspaceChange(event.target.value)}>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <ChevronDown />
        </label>
        <button className="sidebar-create" onClick={onCreateWorkspace}>
          <Plus /> Create Company
        </button>
        <nav className="side-nav">
          {user.platformRole === "super_admin" && (
            <button className={activeView === "platform" ? "active" : ""} onClick={() => onNavigate("platform")}>
              <Building2 /> Platform
            </button>
          )}
          {activeTenant?.role && ["owner", "admin", "support"].includes(activeTenant.role) && (
            <button className={activeView === "tenant" ? "active" : ""} onClick={() => onNavigate("tenant")}>
              <Building2 /> Tenant
            </button>
          )}
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => onNavigate("dashboard")}>
            <LayoutDashboard /> Dashboard
          </button>
          {can(activeWorkspace.role, UiPermissions.CUSTOMERS_VIEW) && (
            <button className={activeView === "customers" || activeView === "customer" ? "active" : ""} onClick={() => onNavigate("customers")}>
              <UserRound /> Customers
            </button>
          )}
          {can(activeWorkspace.role, UiPermissions.PROJECTS_VIEW) && (
            <button className={activeView === "projects" || activeView === "designer" ? "active" : ""} onClick={() => onNavigate("projects")}>
              <FolderOpen /> Projects
            </button>
          )}
          <span />
          {can(activeWorkspace.role, UiPermissions.TEAM_VIEW) && (
            <button className={activeView === "team" ? "active" : ""} onClick={() => onNavigate("team")}>
              <Users /> Team
            </button>
          )}
          {can(activeWorkspace.role, UiPermissions.SETTINGS_VIEW) && (
            <button className={activeView === "settings" ? "active" : ""} onClick={() => onNavigate("settings")}>
              <Settings /> Settings
            </button>
          )}
          <button className={activeView === "profile" ? "active" : ""} onClick={() => onNavigate("profile")}>
            <UserRound /> Profile
          </button>
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button onClick={() => void onLogout()} title="Logout">
            <LogOut />
          </button>
        </div>
      </aside>
      <main className="saas-main">
        {supportMode?.active && (
          <div className="support-banner">
            <LifeBuoy />
            <div>
              <strong>Support Mode Viewing {supportMode.company.name}</strong>
              <span>Logged in as {supportMode.supportUser.email}. Tenant: {supportMode.tenant.name}</span>
            </div>
            <button className="secondary-action" onClick={() => void onExitSupportMode?.()}>
              Exit Support Mode
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
