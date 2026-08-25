import { ArrowLeft, FolderOpen, Plus } from "lucide-react";
import type { Customer } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

interface Props {
  customer: Customer | null;
  onBack: () => void;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

export function CustomerDetailPage({ customer, onBack, onNewProject, onOpenProject }: Props) {
  if (!customer) {
    return (
      <section className="saas-page">
        <PageHeader title="Customer" action={<button className="secondary-action inline-action" onClick={onBack}><ArrowLeft /> Back</button>} />
        <p className="empty-state">Customer not found</p>
      </section>
    );
  }

  return (
    <section className="saas-page">
      <PageHeader
        title={customer.name}
        subtitle={customer.companyName || customer.customerType}
        action={<button className="secondary-action inline-action" onClick={onBack}><ArrowLeft /> Back</button>}
      />
      <section className="customer-detail-grid">
        <div className="saas-panel detail-card">
          <h2>Customer Details</h2>
          <Detail label="Phone" value={customer.phone} />
          <Detail label="Email" value={customer.email} />
          <Detail label="Customer Address" value={[customer.address, customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ")} />
          <Detail label="Notes" value={customer.notes} />
        </div>
        <div className="saas-panel">
          <div className="section-title">
            <h2>Projects</h2>
            <button className="home-new-btn" onClick={onNewProject}>
              <Plus /> New Project
            </button>
          </div>
          {!customer.projects?.length ? (
            <p className="empty-state">No projects for this customer yet</p>
          ) : (
            <div className="row-list">
              {customer.projects.map((project) => (
                <button key={project.id} className="row-button" onClick={() => onOpenProject(project.id)}>
                  <strong>{project.name}</strong>
                  <span>{project.address || "No installation address"}</span>
                  <em>{project.systemSizeKw?.toFixed(2) ?? "0.00"} kW · {project.panelCount ?? 0} panels</em>
                  <FolderOpen />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}
