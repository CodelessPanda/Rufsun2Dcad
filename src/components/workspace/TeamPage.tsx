import type { WorkspaceMember } from "../../api/types";
import { PageHeader } from "./WorkspaceShell";

export function TeamPage({ members }: { members: WorkspaceMember[] }) {
  return (
    <section className="saas-page">
      <PageHeader title="Team" subtitle="Workspace members" />
      <section className="saas-panel">
        <table className="project-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td><strong>{member.user.name}</strong></td>
                <td>{member.user.email}</td>
                <td>{member.role}</td>
                <td>{member.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
