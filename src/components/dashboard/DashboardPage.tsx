import { FolderOpen, Gauge, PanelsTopLeft, Plus, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { CloudProject, CompanyCommercialSummary, Customer, WorkspaceMember, WorkspaceSummary } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

interface Props {
  summary?: WorkspaceSummary;
  projects: CloudProject[];
  customers: Customer[];
  members?: WorkspaceMember[];
  licensing?: CompanyCommercialSummary | null;
  onNewProject?: () => void;
  onOpenProject: (projectId: string) => void;
}

export function DashboardPage({ summary, projects, customers, members = [], licensing, onNewProject, onOpenProject }: Props) {
  const recentProjects = projects.slice(0, 5);
  const designerSeat = licensing?.seats.find((seat) => seat.seatType === "designer");
  const solarUsage = licensing?.usage.solarRequestsMonth.used ?? 0;
  return (
    <section className="saas-page">
      <PageHeader
        title="Company Control Center"
        subtitle="Workspace operations, projects, team capacity, and entitlement usage"
        action={
          onNewProject ? (
            <button className="primary-action" onClick={onNewProject}>
              <Plus /> Project
            </button>
          ) : undefined
        }
      />
      <div className="dashboard-metrics">
        <Metric icon={<UsersRound />} label="Customers" value={summary?.customers ?? customers.length} />
        <Metric icon={<FolderOpen />} label="Projects" value={summary?.projects ?? projects.length} />
        <Metric icon={<Gauge />} label="Active Projects" value={summary?.activeProjects ?? projects.filter((project) => project.status === "active").length} />
        <Metric icon={<PanelsTopLeft />} label="Designed Capacity" value={`${(summary?.totalDesignedCapacityKw ?? 0).toFixed(2)} kW`} />
        <Metric icon={<ShieldCheck />} label="Designer Seats" value={designerSeat ? seatValue(designerSeat) : "Not assigned"} />
        <Metric icon={<UsersRound />} label="Team Members" value={members.filter((member) => member.status === "active").length} />
      </div>
      <section className="saas-panel utilization-card">
        <div className="panel-heading-row">
          <div>
            <h2>License Utilization</h2>
            <p>{licensing?.plan?.name ?? "No plan assigned"} · Solar API calls this month: {solarUsage}</p>
          </div>
          <ShieldCheck />
        </div>
        <div className="seat-card-grid">
          {(licensing?.seats ?? []).map((seat) => (
            <div key={seat.seatType} className="license-card">
              <span>{seat.seatType}</span>
              <strong>{seat.unlimited ? "Unlimited" : seat.total ?? 0}</strong>
              <small>{seat.assigned ?? 0} assigned · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
            </div>
          ))}
          {!licensing && <p className="empty-state">Licensing data is not available for this company.</p>}
        </div>
      </section>
      <section className="saas-panel">
        <div className="section-title">
          <h2>Recent Projects</h2>
        </div>
        {recentProjects.length === 0 ? (
          <div className="empty-action-state">
            <p>No cloud projects yet</p>
            {onNewProject && <button className="secondary-action" onClick={onNewProject}><Plus /> Create Project</button>}
          </div>
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

function seatValue(seat: NonNullable<CompanyCommercialSummary["seats"][number]>) {
  if (seat.unlimited) return `${seat.assigned ?? 0} / unlimited`;
  return `${seat.assigned ?? 0} / ${seat.total ?? 0}`;
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
