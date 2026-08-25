import { Building2, ChevronDown, LayoutDashboard, LogOut, Settings, Users, UserRound, FolderOpen, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiUser, Workspace } from "../../api/types";

export type AppView = "dashboard" | "customers" | "customer" | "projects" | "designer" | "team" | "settings";

interface Props {
  user: ApiUser;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeView: AppView;
  children: ReactNode;
  onWorkspaceChange: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onNavigate: (view: AppView) => void;
  onLogout: () => Promise<void>;
}

export function WorkspaceShell({
  user,
  workspaces,
  activeWorkspace,
  activeView,
  children,
  onWorkspaceChange,
  onCreateWorkspace,
  onNavigate,
  onLogout
}: Props) {
  return (
    <div className="saas-shell">
      <aside className="saas-sidebar">
        <div className="brand saas-brand">
          <span className="brand-mark">R</span>
          <strong>RufsunCAD</strong>
        </div>
        <label className="workspace-switcher">
          <span>Workspace</span>
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
          <Plus /> Create Workspace
        </button>
        <nav className="side-nav">
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => onNavigate("dashboard")}>
            <LayoutDashboard /> Dashboard
          </button>
          <button className={activeView === "customers" || activeView === "customer" ? "active" : ""} onClick={() => onNavigate("customers")}>
            <UserRound /> Customers
          </button>
          <button className={activeView === "projects" || activeView === "designer" ? "active" : ""} onClick={() => onNavigate("projects")}>
            <FolderOpen /> Projects
          </button>
          <span />
          <button className={activeView === "team" ? "active" : ""} onClick={() => onNavigate("team")}>
            <Users /> Team
          </button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => onNavigate("settings")}>
            <Settings /> Settings
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
      <main className="saas-main">{children}</main>
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
