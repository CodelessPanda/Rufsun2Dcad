import { Building2, MailPlus, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Company, Invitation, MembershipStatus, SeatSummary, Tenant, TenantCommercialSummary, TenantMember, TenantRole } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

const TENANT_ROLES: TenantRole[] = ["owner", "admin", "billing", "support", "member"];

export function TenantCompaniesPage({
  tenant,
  companies,
  activeCompanyId,
  onCompanyChange,
  onChanged
}: {
  tenant: Tenant;
  companies: Company[];
  activeCompanyId: string;
  onCompanyChange: (companyId: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [licensing, setLicensing] = useState<TenantCommercialSummary | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("member");

  useEffect(() => {
    setError("");
    void loadMembers();
    void loadLicensing();
  }, [tenant.id]);

  const loadMembers = async () => {
    try {
      const result = await api.tenantMembers(tenant.id);
      setMembers(result.members);
      setInvitations(result.invitations);
    } catch {
      setMembers([]);
      setInvitations([]);
    }
  };

  const loadLicensing = async () => {
    try {
      setLicensing(await api.tenantLicensing(tenant.id));
    } catch {
      setLicensing(null);
    }
  };

  const createCompany = async () => {
    const name = window.prompt("Company name");
    if (!name?.trim()) return;
    setBusy(true);
    setError("");
    try {
      const company = await api.createTenantCompany(tenant.id, { name: name.trim() });
      await onChanged();
      await loadLicensing();
      onCompanyChange(company.id);
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.inviteTenantMember(tenant.id, { email: inviteEmail, role: inviteRole });
      setInviteEmail("");
      await loadMembers();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateMember = async (membershipId: string, input: { role?: TenantRole; status?: MembershipStatus }) => {
    await api.updateTenantMember(tenant.id, membershipId, input);
    await loadMembers();
  };

  const removeMember = async (membershipId: string) => {
    if (!window.confirm("Remove this tenant member?")) return;
    await api.removeTenantMember(tenant.id, membershipId);
    await loadMembers();
  };

  const editAllocation = async (companyId: string, seat: SeatSummary) => {
    const raw = window.prompt(`${seatLabel(seat.seatType)} allocation. Leave blank for unlimited.`, seat.unlimited ? "" : String(seat.allocated ?? 0));
    if (raw === null) return;
    setBusy(true);
    setError("");
    try {
      const trimmed = raw.trim();
      await api.updateCompanySeatAllocation(tenant.id, companyId, {
        seatType: seat.seatType,
        unlimited: trimmed === "",
        allocated: trimmed === "" ? undefined : Math.max(0, Number(trimmed))
      });
      await loadLicensing();
      await onChanged();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="saas-page tenant-page">
      <PageHeader
        title="Tenant"
        subtitle={`${tenant.name} companies`}
        action={
          <div className="layout-actions">
            <button className="secondary-action" onClick={() => void onChanged()} disabled={busy}>
              <RefreshCw /> Refresh
            </button>
            <button className="primary-action" onClick={() => void createCompany()} disabled={busy}>
              <Plus /> Company
            </button>
          </div>
        }
      />
      {error && <p className="warning">{error}</p>}
      {licensing && (
        <section className="saas-panel license-management-panel">
          <div className="panel-heading-row">
            <div>
              <h2>License Management</h2>
              <p>{licensing.plan?.name ?? "No plan assigned"} · {statusLabel(licensing.subscription?.status)}</p>
            </div>
            <SlidersHorizontal />
          </div>
          <div className="seat-card-grid">
            {licensing.capacities.map((seat) => (
              <div key={seat.seatType} className="license-card">
                <span>{seatLabel(seat.seatType)}</span>
                <strong>{seat.unlimited ? "Unlimited" : seat.total ?? 0}</strong>
                <small>{seat.allocated ?? 0} allocated · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
              </div>
            ))}
          </div>
          <table className="project-table polished-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Designer</th>
                <th>Sales</th>
                <th>Viewer</th>
              </tr>
            </thead>
            <tbody>
              {licensing.companies.map((company) => (
                <tr key={company.id}>
                  <td><strong>{company.name}</strong><small>{company.memberCount} members</small></td>
                  {company.allocations.map((seat) => (
                    <td key={seat.seatType}>
                      <button className="allocation-button" onClick={() => void editAllocation(company.id, seat)}>
                        {seat.unlimited ? "Unlimited" : seat.allocated ?? 0}
                        <small>{seat.assigned ?? 0} assigned</small>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="saas-panel">
        <table className="project-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Status</th>
              <th>Customers</th>
              <th>Projects</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className={company.id === activeCompanyId ? "selected-row" : ""}>
                <td><strong>{company.name}</strong></td>
                <td><span className={`status-pill ${company.status}`}>{company.status}</span></td>
                <td>{company._count?.customers ?? 0}</td>
                <td>{company._count?.projects ?? 0}</td>
                <td className="project-actions">
                  <button onClick={() => onCompanyChange(company.id)}>
                    <Building2 /> Switch
                  </button>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="project-empty">No companies available for this tenant</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="saas-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Tenant Members</h2>
            <p>Tenant roles are separate from company seats.</p>
          </div>
        </div>
        <div className="team-invite-grid tenant-invite-grid">
          <label className="field stacked">
            <span>Email</span>
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          </label>
          <label className="field stacked">
            <span>Tenant Role</span>
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as TenantRole)}>
              {TENANT_ROLES.map((role) => (
                  <option key={role} value={role}>{roleLabel(role)}</option>
              ))}
            </select>
          </label>
          <button className="primary-action compact" disabled={busy || !inviteEmail.trim()} onClick={() => void inviteMember()}>
            <MailPlus /> Invite
          </button>
        </div>
        <table className="project-table team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td><strong>{member.user.name}</strong></td>
                <td>{member.user.email}</td>
                <td>
                  <select value={member.role} onChange={(event) => void updateMember(member.id, { role: event.target.value as TenantRole })}>
                    {TENANT_ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                </td>
                <td><span className={`status-pill ${member.status}`}>{statusLabel(member.status)}</span></td>
                <td className="table-actions">
                  <button className="ghost-button compact" onClick={() => void updateMember(member.id, { status: member.status === "active" ? "suspended" : "active" })}>
                    {member.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                  <button className="icon-button danger" title="Remove tenant member" onClick={() => void removeMember(member.id)}>
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="project-empty">No tenant members found</td>
              </tr>
            )}
          </tbody>
        </table>
        {invitations.length > 0 && (
          <p className="form-note">{invitations.length} pending tenant invitation{invitations.length === 1 ? "" : "s"}.</p>
        )}
      </section>
    </section>
  );
}

function formatError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function seatLabel(seat: SeatSummary["seatType"]) {
  return titleCase(seat);
}

function roleLabel(role: TenantRole) {
  return titleCase(role);
}

function statusLabel(status?: string) {
  return status ? titleCase(status.replace(/_/g, " ")) : "Not Assigned";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
