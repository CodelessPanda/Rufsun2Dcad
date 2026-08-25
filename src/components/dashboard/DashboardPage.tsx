import { FolderOpen, Gauge, PanelsTopLeft, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { CloudProject, Customer, WorkspaceSummary } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

interface Props {
  summary?: WorkspaceSummary;
  projects: CloudProject[];
  customers: Customer[];
  onOpenProject: (projectId: string) => void;
}

export function DashboardPage({ summary, projects, customers, onOpenProject }: Props) {
  const recentProjects = projects.slice(0, 5);
  return (
    <section className="saas-page">
      <PageHeader title="Dashboard" subtitle="Workspace overview" />
      <div className="dashboard-metrics">
        <Metric icon={<UsersRound />} label="Customers" value={summary?.customers ?? customers.length} />
        <Metric icon={<FolderOpen />} label="Projects" value={summary?.projects ?? projects.length} />
        <Metric icon={<Gauge />} label="Active Projects" value={summary?.activeProjects ?? projects.filter((project) => project.status === "active").length} />
        <Metric icon={<PanelsTopLeft />} label="Designed Capacity" value={`${(summary?.totalDesignedCapacityKw ?? 0).toFixed(2)} kW`} />
      </div>
      <section className="saas-panel">
        <div className="section-title">
          <h2>Recent Projects</h2>
        </div>
        {recentProjects.length === 0 ? (
          <p className="empty-state">No cloud projects yet</p>
        ) : (
          <div className="row-list">
            {recentProjects.map((project) => (
              <button key={project.id} className="row-button" onClick={() => onOpenProject(project.id)}>
                <strong>{project.name}</strong>
                <span>{project.customer?.name || "No customer"} · {project.address || "No location"}</span>
                <em>{project.systemSizeKw?.toFixed(2) ?? "0.00"} kW</em>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="dashboard-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
