import { Building2, MailPlus, Plus, RefreshCw, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Company, CompanyStatus, Invitation, MembershipStatus, SeatSummary, Tenant, TenantCommercialSummary, TenantMember, TenantRole } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

const TENANT_ROLES: TenantRole[] = ["owner", "admin", "billing", "support", "member"];
const COMPANY_STATUSES: CompanyStatus[] = ["active", "suspended", "archived"];

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
  const [tenantCompanies, setTenantCompanies] = useState<Company[]>(companies);
  const [companySearch, setCompanySearch] = useState("");
  const [companyStatusFilter, setCompanyStatusFilter] = useState("all");
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("member");

  useEffect(() => {
    setError("");
    void loadMembers();
    void loadLicensing();
    void loadCompanies();
  }, [tenant.id]);

  useEffect(() => {
    setTenantCompanies(companies);
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const needle = companySearch.trim().toLowerCase();
    return tenantCompanies.filter((company) => {
      const matchesSearch = !needle || [company.name, company.slug, company.address ?? "", company.email ?? ""].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = companyStatusFilter === "all" || company.status === companyStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [companySearch, companyStatusFilter, tenantCompanies]);

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

  const loadCompanies = async () => {
    try {
      setTenantCompanies(await api.tenantCompanies(tenant.id));
    } catch {
      setTenantCompanies(companies);
    }
  };

  const createCompany = async (input: { name: string; slug?: string; primaryAdminEmail?: string; designerAllocation?: number; salesAllocation?: number }) => {
    setBusy(true);
    setError("");
    try {
      const company = await api.createTenantCompany(tenant.id, input);
      setCompanyDialogOpen(false);
      await onChanged();
      await loadLicensing();
      await loadCompanies();
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

  const updateCompanyStatus = async (company: Company, status: CompanyStatus) => {
    if (status !== "active" && !window.confirm(`${statusLabel(status)} ${company.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.updateTenantCompany(tenant.id, company.id, { status });
      await loadCompanies();
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
            <button className="secondary-action" onClick={() => void Promise.all([onChanged(), loadCompanies(), loadLicensing()])} disabled={busy}>
              <RefreshCw /> Refresh
            </button>
            <button className="primary-action" onClick={() => setCompanyDialogOpen(true)} disabled={busy}>
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
        <div className="admin-search-row tenant-company-toolbar">
          <label className="field search-field">
            <Search />
            <input value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Search companies" />
          </label>
          <label className="field stacked">
            <span>Status</span>
            <select value={companyStatusFilter} onChange={(event) => setCompanyStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option>
              {COMPANY_STATUSES.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>
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
            {filteredCompanies.map((company) => (
              <tr key={company.id} className={company.id === activeCompanyId ? "selected-row" : ""}>
                <td><strong>{company.name}</strong></td>
                <td><span className={`status-pill ${company.status}`}>{company.status}</span></td>
                <td>{company._count?.customers ?? 0}</td>
                <td>{company._count?.projects ?? 0}</td>
                <td className="project-actions">
                  <button onClick={() => onCompanyChange(company.id)}>
                    <Building2 /> Switch
                  </button>
                  <button className="ghost-button compact" disabled={busy} onClick={() => void updateCompanyStatus(company, company.status === "active" ? "suspended" : "active")}>
                    {company.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredCompanies.length === 0 && (
              <tr>
                <td colSpan={5} className="project-empty">No companies match these filters</td>
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
      {companyDialogOpen && <CompanyDialog busy={busy} onCancel={() => setCompanyDialogOpen(false)} onCreate={createCompany} />}
    </section>
  );
}

function CompanyDialog({
  busy,
  onCancel,
  onCreate
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; slug?: string; primaryAdminEmail?: string; designerAllocation?: number; salesAllocation?: number }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [primaryAdminEmail, setPrimaryAdminEmail] = useState("");
  const [designerAllocation, setDesignerAllocation] = useState("");
  const [salesAllocation, setSalesAllocation] = useState("");
  return (
    <div className="modal-backdrop">
      <form
        className="modal-card phase5-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onCreate({
            name: name.trim(),
            slug: slug.trim() || undefined,
            primaryAdminEmail: primaryAdminEmail.trim() || undefined,
            designerAllocation: parseOptionalNumber(designerAllocation),
            salesAllocation: parseOptionalNumber(salesAllocation)
          });
        }}
      >
        <h2>Create Company</h2>
        <label className="field stacked">
          <span>Company Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>Slug</span>
            <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="optional" />
          </label>
          <label className="field stacked">
            <span>Primary Admin Email</span>
            <input type="email" value={primaryAdminEmail} onChange={(event) => setPrimaryAdminEmail(event.target.value)} placeholder="optional" />
          </label>
        </div>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>Designer Seats</span>
            <input inputMode="numeric" value={designerAllocation} onChange={(event) => setDesignerAllocation(event.target.value)} placeholder="0" />
          </label>
          <label className="field stacked">
            <span>Sales Seats</span>
            <input inputMode="numeric" value={salesAllocation} onChange={(event) => setSalesAllocation(event.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={busy || !name.trim()}>Create</button>
        </div>
      </form>
    </div>
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

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}
