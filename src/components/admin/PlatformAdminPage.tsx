import {
  Building2,
  CheckCircle2,
  LifeBuoy,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import type {
  AdminCompanyDetail,
  AdminCompanySummary,
  AdminDashboard,
  CompanyStatus,
  Plan,
  PlanCode,
  SeatSummary,
  SubscriptionStatus,
  Tenant,
  TenantCommercialSummary,
  TenantStatus,
  TenantType
} from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

const PLAN_CODES: PlanCode[] = ["starter", "professional", "business", "enterprise", "distributor", "internal"];
const STATUSES: SubscriptionStatus[] = ["trialing", "active", "grace_period", "suspended", "canceled", "expired"];
const TENANT_STATUSES: TenantStatus[] = ["active", "suspended", "archived"];
const COMPANY_STATUSES: CompanyStatus[] = ["active", "suspended", "archived"];

type AdminTenant = Tenant & { commercial?: TenantCommercialSummary };
type AdminTab = "dashboard" | "tenants" | "companies";

interface Props {
  onChanged: () => Promise<void>;
  onLogout?: () => Promise<void>;
  onEnterSupportMode?: (companyId: string) => Promise<void>;
}

export function PlatformAdminPage({ onChanged, onLogout, onEnterSupportMode }: Props) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [companies, setCompanies] = useState<AdminCompanySummary[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyDetail, setCompanyDetail] = useState<AdminCompanyDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];

  const filteredTenants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const subscriptionStatus = tenant.commercial?.subscription?.status ?? "not_assigned";
      const planCode = tenant.commercial?.plan?.code ?? "not_assigned";
      const matchesSearch = !needle || [tenant.name, tenant.slug, tenant.type].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || tenant.status === statusFilter || subscriptionStatus === statusFilter;
      const matchesPlan = scopeFilter === "all" || planCode === scopeFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [scopeFilter, search, statusFilter, tenants]);

  const filteredCompanies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return companies.filter((company) => {
      const haystack = [company.name, company.slug, company.tenant?.name ?? "", company.primaryAdmin?.email ?? "", company.address ?? ""];
      const matchesSearch = !needle || haystack.some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || company.status === statusFilter;
      const matchesTenant = scopeFilter === "all" || company.tenantId === scopeFilter;
      return matchesSearch && matchesStatus && matchesTenant;
    });
  }, [companies, scopeFilter, search, statusFilter]);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [nextDashboard, nextTenants, nextCompanies, nextPlans] = await Promise.all([
        api.adminDashboard(),
        api.commercialOverview(),
        api.adminCompanies(),
        api.commercialPlans()
      ]);
      setDashboard(nextDashboard);
      setTenants(nextTenants);
      setCompanies(nextCompanies);
      setPlans(nextPlans);
      setSelectedTenantId((current) => (nextTenants.some((tenant) => tenant.id === current) ? current : nextTenants[0]?.id ?? ""));
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createTenant = async (input: { name: string; type: TenantType }) => {
    setBusy(true);
    setError("");
    try {
      const tenant = await api.createAdminTenant(input);
      setTenantDialogOpen(false);
      await load();
      await onChanged();
      setSelectedTenantId(tenant.id);
      setTab("tenants");
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const createCompany = async (input: { name: string; slug?: string; primaryAdminEmail?: string; designerAllocation?: number; salesAllocation?: number }) => {
    if (!selectedTenant) return;
    setBusy(true);
    setError("");
    try {
      await api.createTenantCompany(selectedTenant.id, input);
      setCompanyDialogOpen(false);
      await load();
      await onChanged();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateSubscription = async (tenantId: string, planCode: PlanCode, status: SubscriptionStatus) => {
    setBusy(true);
    setError("");
    try {
      await api.updateTenantSubscription(tenantId, { planCode, status });
      await load();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateCapacity = async (tenantId: string, seat: SeatSummary) => {
    const raw = window.prompt(`${seatLabel(seat.seatType)} capacity. Leave blank for unlimited.`, seat.unlimited ? "" : String(seat.total ?? 0));
    if (raw === null) return;
    setBusy(true);
    setError("");
    try {
      const trimmed = raw.trim();
      await api.updateTenantSeatCapacity(tenantId, {
        seatType: seat.seatType,
        unlimited: trimmed === "",
        total: trimmed === "" ? undefined : Math.max(0, Number(trimmed))
      });
      await load();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateTenantStatus = async (tenant: AdminTenant, status: TenantStatus) => {
    if (status !== "active" && !window.confirm(`${statusLabel(status)} ${tenant.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.updateAdminTenant(tenant.id, { status });
      await load();
      await onChanged();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const updateCompanyStatus = async (company: AdminCompanySummary, status: CompanyStatus) => {
    if (status !== "active" && !window.confirm(`${statusLabel(status)} ${company.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.updateTenantCompany(company.tenantId, company.id, { status });
      await load();
      await onChanged();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const startSupportMode = async (companyId: string) => {
    if (!onEnterSupportMode) return;
    setBusy(true);
    setError("");
    try {
      await onEnterSupportMode(companyId);
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const inspectCompany = async (companyId: string) => {
    setBusy(true);
    setError("");
    try {
      setCompanyDetail(await api.adminCompany(companyId));
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="saas-page phase5-admin-page">
      <PageHeader
        title="Rufsun Control Center"
        subtitle="Super Admin visibility across tenants, companies, licensing, seats, usage, and support access"
        action={
          <div className="layout-actions">
            <button className="secondary-action" onClick={() => void load()} disabled={busy}>
              <RefreshCw /> Refresh
            </button>
            <button className="primary-action" onClick={() => setTenantDialogOpen(true)} disabled={busy}>
              <Plus /> Tenant
            </button>
            {onLogout && (
              <button className="secondary-action" onClick={() => void onLogout()}>
                <LogOut /> Logout
              </button>
            )}
          </div>
        }
      />
      {error && <p className="warning">{error}</p>}

      <div className="control-tabs" role="tablist" aria-label="Platform control sections">
        {(["dashboard", "tenants", "companies"] as AdminTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {titleCase(item)}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <>
          <section className="admin-metric-grid">
            <Metric label="Total Tenants" value={dashboard?.metrics.totalTenants ?? tenants.length} />
            <Metric label="Active Tenants" value={dashboard?.metrics.activeTenants ?? tenants.filter((tenant) => tenant.status === "active").length} />
            <Metric label="Companies" value={dashboard?.metrics.companies ?? companies.length} />
            <Metric label="Users" value={dashboard?.metrics.users ?? 0} />
            <Metric label="Subscriptions" value={dashboard?.metrics.activeSubscriptions ?? 0} />
            <Metric label="Designer Seats" value={`${dashboard?.metrics.designerSeats.assigned ?? 0} / ${dashboard?.metrics.designerSeats.allocated ?? 0}`} />
            <Metric label="Solar API Usage" value={dashboard?.metrics.solarApiUsage ?? 0} />
            <Metric label="Projects" value={dashboard?.metrics.projects ?? companies.reduce((sum, company) => sum + company.projects, 0)} />
          </section>
          <section className="saas-panel activity-panel">
            <div className="panel-heading-row">
              <div>
                <h2>Recent Platform Activity</h2>
                <p>Latest tenants, companies, projects, and invitations.</p>
              </div>
              <CheckCircle2 />
            </div>
            <div className="activity-list">
              {(dashboard?.recentActivity ?? []).map((activity, index) => (
                <div key={`${activity.type}-${activity.at}-${index}`} className="activity-row">
                  <span>{activity.type}</span>
                  <strong>{activity.label}</strong>
                  <small>{activity.context ?? "Platform"} · {formatDate(activity.at)}</small>
                </div>
              ))}
              {(dashboard?.recentActivity ?? []).length === 0 && <p className="empty-state">No recent activity yet</p>}
            </div>
          </section>
        </>
      )}

      {tab !== "dashboard" && (
        <section className="saas-panel admin-filter-panel">
          <div className="admin-search-row">
            <label className="field search-field">
              <Search />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "tenants" ? "Search tenants" : "Search companies"} />
            </label>
            <label className="field stacked">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                {(tab === "tenants" ? TENANT_STATUSES : COMPANY_STATUSES).map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
                {tab === "tenants" && STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </label>
            <label className="field stacked">
              <span>{tab === "tenants" ? "Plan" : "Tenant"}</span>
              <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
                <option value="all">{tab === "tenants" ? "All Plans" : "All Tenants"}</option>
                {tab === "tenants"
                  ? (plans.length ? plans.map((plan) => plan.code) : PLAN_CODES).map((code) => <option key={code} value={code}>{planLabel(code)}</option>)
                  : tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {tab === "tenants" && (
        <section className="commercial-overview-grid">
          <div className="commercial-tenant-list">
            {filteredTenants.map((tenant) => (
              <button key={tenant.id} className={`tenant-commercial-card ${tenant.id === selectedTenant?.id ? "active" : ""}`} onClick={() => setSelectedTenantId(tenant.id)}>
                <span>
                  <strong>{tenant.name}</strong>
                  <small>{titleCase(tenant.type)} · {tenant._count?.companies ?? tenant.commercial?.companies.length ?? 0} companies</small>
                </span>
                <em className={`status-pill ${tenant.status}`}>{statusLabel(tenant.status)}</em>
              </button>
            ))}
            {filteredTenants.length === 0 && <div className="project-empty">No tenants match these filters</div>}
          </div>
          <TenantDetail
            tenant={selectedTenant}
            plans={plans}
            busy={busy}
            onCreateCompany={() => setCompanyDialogOpen(true)}
            onUpdateSubscription={updateSubscription}
            onUpdateCapacity={updateCapacity}
            onUpdateStatus={updateTenantStatus}
          />
        </section>
      )}

      {tab === "companies" && (
        <section className="admin-card-grid">
          {filteredCompanies.map((company) => (
            <article key={company.id} className="admin-company-card">
              <div className="company-card-title">
                <div>
                  <h2>{company.name}</h2>
                  <p>{company.tenant?.name ?? "Unknown tenant"} · {company.address || "No address"}</p>
                </div>
                <span className={`status-pill ${company.status}`}>{statusLabel(company.status)}</span>
              </div>
              <div className="company-card-stats">
                <MiniStat label="Users" value={company.users} />
                <MiniStat label="Customers" value={company.customers} />
                <MiniStat label="Projects" value={company.projects} />
                <MiniStat label="Solar API" value={company.solarUsage} />
                <MiniStat label="Designer" value={seatAvailability(company.designerSeats)} />
                <MiniStat label="Sales" value={seatAvailability(company.salesSeats)} />
              </div>
              <div className="company-card-footer">
                <span>{company.primaryAdmin ? `${company.primaryAdmin.name} · ${company.primaryAdmin.email}` : "No primary admin found"}</span>
                <div className="layout-actions">
                  <button className="secondary-action" disabled={busy} onClick={() => void inspectCompany(company.id)}>
                    Details
                  </button>
                  <button className="secondary-action" disabled={busy || !onEnterSupportMode} onClick={() => void startSupportMode(company.id)}>
                    <LifeBuoy /> Support
                  </button>
                  <button className="ghost-button" disabled={busy} onClick={() => void updateCompanyStatus(company, company.status === "active" ? "suspended" : "active")}>
                    {company.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {filteredCompanies.length === 0 && <div className="saas-panel project-empty">No companies match these filters</div>}
        </section>
      )}

      {tenantDialogOpen && <TenantDialog busy={busy} onCancel={() => setTenantDialogOpen(false)} onCreate={createTenant} />}
      {companyDialogOpen && selectedTenant && <CompanyDialog tenant={selectedTenant} busy={busy} onCancel={() => setCompanyDialogOpen(false)} onCreate={createCompany} />}
      {companyDetail && <CompanyDetailDialog detail={companyDetail} onCancel={() => setCompanyDetail(null)} />}
    </section>
  );
}

function CompanyDetailDialog({ detail, onCancel }: { detail: AdminCompanyDetail; onCancel: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card phase5-dialog company-detail-dialog">
        <div className="company-card-title">
          <div>
            <h2>{detail.name}</h2>
            <p>{detail.tenant?.name ?? "Unknown tenant"} · {detail.company.address || "No address"}</p>
          </div>
          <span className={`status-pill ${detail.status}`}>{statusLabel(detail.status)}</span>
        </div>
        <div className="company-card-stats">
          <MiniStat label="Users" value={detail.users} />
          <MiniStat label="Customers" value={detail.customers.length} />
          <MiniStat label="Projects" value={detail.projects.length} />
          <MiniStat label="Solar API" value={detail.solarUsage} />
          <MiniStat label="Designer" value={seatAvailability(detail.designerSeats)} />
          <MiniStat label="Sales" value={seatAvailability(detail.salesSeats)} />
        </div>
        <section className="settings-subsection">
          <h2>Licensing</h2>
          <div className="seat-card-grid">
            {detail.licensing.seats.map((seat) => (
              <div key={seat.seatType} className="license-card">
                <span>{seatLabel(seat.seatType)}</span>
                <strong>{seat.unlimited ? "Unlimited" : seat.total ?? 0}</strong>
                <small>{seat.assigned ?? 0} assigned · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
              </div>
            ))}
          </div>
        </section>
        <div className="detail-list-grid">
          <section>
            <h3>Recent Customers</h3>
            {detail.customers.slice(0, 5).map((customer) => <p key={customer.id}>{customer.name}</p>)}
            {detail.customers.length === 0 && <p>No customers</p>}
          </section>
          <section>
            <h3>Recent Projects</h3>
            {detail.projects.slice(0, 5).map((project) => <p key={project.id}>{project.name}</p>)}
            {detail.projects.length === 0 && <p>No projects</p>}
          </section>
        </div>
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>Close</button>
        </div>
      </div>
    </div>
  );
}

function TenantDetail({
  tenant,
  plans,
  busy,
  onCreateCompany,
  onUpdateSubscription,
  onUpdateCapacity,
  onUpdateStatus
}: {
  tenant?: AdminTenant;
  plans: Plan[];
  busy: boolean;
  onCreateCompany: () => void;
  onUpdateSubscription: (tenantId: string, planCode: PlanCode, status: SubscriptionStatus) => void;
  onUpdateCapacity: (tenantId: string, seat: SeatSummary) => void;
  onUpdateStatus: (tenant: AdminTenant, status: TenantStatus) => void;
}) {
  if (!tenant) return <div className="commercial-detail-panel project-empty">Select a tenant to manage.</div>;

  return (
    <div className="commercial-detail-panel">
      <div className="commercial-hero compact-hero">
        <div>
          <span className="eyebrow">Tenant Detail</span>
          <h2>{tenant.name}</h2>
          <p>{tenant.commercial?.plan?.name ?? "No plan assigned"} · {statusLabel(tenant.commercial?.subscription?.status)}</p>
        </div>
        <UsersRound />
      </div>
      <div className="commercial-controls">
        <label className="field stacked">
          <span>Plan</span>
          <select
            value={tenant.commercial?.plan?.code ?? "internal"}
            onChange={(event) => onUpdateSubscription(tenant.id, event.target.value as PlanCode, tenant.commercial?.subscription?.status ?? "active")}
          >
            {(plans.length ? plans.map((plan) => plan.code) : PLAN_CODES).map((code) => (
              <option key={code} value={code}>{planLabel(code)}</option>
            ))}
          </select>
        </label>
        <label className="field stacked">
          <span>Subscription</span>
          <select
            value={tenant.commercial?.subscription?.status ?? "active"}
            onChange={(event) => onUpdateSubscription(tenant.id, tenant.commercial?.plan?.code ?? "internal", event.target.value as SubscriptionStatus)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className="field stacked">
          <span>Tenant Status</span>
          <select value={tenant.status} onChange={(event) => onUpdateStatus(tenant, event.target.value as TenantStatus)}>
            {TENANT_STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabel(status)}</option>
            ))}
          </select>
        </label>
        <button className="secondary-action" onClick={onCreateCompany} disabled={busy}>
          <Building2 /> Add Company
        </button>
      </div>
      <div className="seat-card-grid">
        {(tenant.commercial?.capacities ?? []).map((seat) => (
          <button key={seat.seatType} className="license-card" onClick={() => onUpdateCapacity(tenant.id, seat)}>
            <span>{seatLabel(seat.seatType)}</span>
            <strong>{seat.unlimited ? "Unlimited" : seat.total ?? 0}</strong>
            <small>{seat.allocated ?? 0} allocated · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
          </button>
        ))}
      </div>
      <div className="saas-panel commercial-table-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Companies</h2>
            <p>Allocation and utilization under this tenant.</p>
          </div>
          <SlidersHorizontal />
        </div>
        <table className="project-table polished-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Designer</th>
              <th>Sales</th>
              <th>Viewer</th>
              <th>Projects</th>
            </tr>
          </thead>
          <tbody>
            {(tenant.commercial?.companies ?? []).map((company) => (
              <tr key={company.id}>
                <td><strong>{company.name}</strong><small>{company.memberCount} members</small></td>
                {company.allocations.map((allocation) => (
                  <td key={allocation.seatType}>{seatCount(allocation)}<small>{allocation.assigned ?? 0} assigned</small></td>
                ))}
                <td>{company.projectCount}</td>
              </tr>
            ))}
            {(tenant.commercial?.companies ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="project-empty">No companies under this tenant</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantDialog({ busy, onCancel, onCreate }: { busy: boolean; onCancel: () => void; onCreate: (input: { name: string; type: TenantType }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TenantType>("distributor");
  return (
    <div className="modal-backdrop">
      <form
        className="modal-card phase5-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onCreate({ name: name.trim(), type });
        }}
      >
        <h2>Create Tenant</h2>
        <label className="field stacked">
          <span>Tenant Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <label className="field stacked">
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value as TenantType)}>
            <option value="direct">Direct</option>
            <option value="distributor">Distributor</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={busy || !name.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}

function CompanyDialog({
  tenant,
  busy,
  onCancel,
  onCreate
}: {
  tenant: AdminTenant;
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
        <p className="form-note">Tenant: {tenant.name}</p>
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function seatAvailability(seat: AdminCompanySummary["designerSeats"]) {
  if (seat.unlimited) return `${seat.assigned} / unlimited`;
  return `${seat.assigned} / ${seat.allocated ?? 0}`;
}

function seatCount(seat: SeatSummary) {
  return seat.unlimited ? "Unlimited" : String(seat.allocated ?? seat.total ?? 0);
}

function planLabel(code: PlanCode) {
  return titleCase(code);
}

function seatLabel(seat: SeatSummary["seatType"]) {
  return titleCase(seat);
}

function statusLabel(status?: string) {
  return status ? titleCase(status.replace(/_/g, " ")) : "Not Assigned";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

function formatError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
