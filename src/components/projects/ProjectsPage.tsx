import { FolderOpen, Plus } from "lucide-react";
import type { CloudProject } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

interface Props {
  projects: CloudProject[];
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

export function ProjectsPage({ projects, onNewProject, onOpenProject }: Props) {
  return (
    <section className="saas-page">
      <PageHeader
        title="Projects"
        subtitle="Cloud projects in the active workspace"
        action={
          <button className="home-new-btn" onClick={onNewProject}>
            <Plus /> New Project
          </button>
        }
      />
      <section className="saas-panel">
        <table className="project-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Customer</th>
              <th>Location</th>
              <th>System Size</th>
              <th>Panels</th>
              <th>Updated</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={8} className="project-empty">No cloud projects yet</td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id}>
                  <td><strong>{project.name}</strong></td>
                  <td>{project.customer?.name || "-"}</td>
                  <td>{project.address || "-"}</td>
                  <td>{project.systemSizeKw?.toFixed(2) ?? "0.00"} kW</td>
                  <td>{project.panelCount ?? 0}</td>
                  <td>{formatDate(project.updatedAt)}</td>
                  <td><span className={`status-pill ${project.status}`}>{project.status}</span></td>
                  <td className="project-actions">
                    <button onClick={() => onOpenProject(project.id)}>
                      <FolderOpen /> Open
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
