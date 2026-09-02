import { Building2, CheckCircle2, LogOut, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Plan, PlanCode, SeatSummary, SubscriptionStatus, Tenant, TenantCommercialSummary } from "../../api/types";
import { PageHeader } from "../workspace/WorkspaceShell";

const PLAN_CODES: PlanCode[] = ["starter", "professional", "business", "enterprise", "distributor", "internal"];
const STATUSES: SubscriptionStatus[] = ["trialing", "active", "grace_period", "suspended", "canceled", "expired"];

type AdminTenant = Tenant & { commercial?: TenantCommercialSummary };

export function PlatformAdminPage({ onChanged, onLogout }: { onChanged: () => Promise<void>; onLogout?: () => Promise<void> }) {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [nextTenants, nextPlans] = await Promise.all([api.commercialOverview(), api.commercialPlans()]);
      setTenants(nextTenants);
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

  const createTenant = async () => {
    const name = window.prompt("Tenant name");
    if (!name?.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createAdminTenant({ name: name.trim(), type: "distributor" });
      await load();
      await onChanged();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy(false);
    }
  };

  const createCompany = async () => {
    if (!selectedTenant) return;
    const name = window.prompt("Company name");
    if (!name?.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createTenantCompany(selectedTenant.id, { name: name.trim() });
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

  return (
    <section className="saas-page commercial-page">
      <PageHeader
        title="Platform Commercial"
        subtitle="Plans, manual subscriptions, tenant capacity, and distributor allocations"
        action={
          <div className="layout-actions">
            <button className="secondary-action" onClick={() => void load()} disabled={busy}>
              <RefreshCw /> Refresh
            </button>
            <button className="primary-action" onClick={() => void createTenant()} disabled={busy}>
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

      <section className="commercial-overview-grid">
        <div className="commercial-tenant-list">
          {tenants.map((tenant) => (
            <button key={tenant.id} className={`tenant-commercial-card ${tenant.id === selectedTenant?.id ? "active" : ""}`} onClick={() => setSelectedTenantId(tenant.id)}>
              <span>
                <strong>{tenant.name}</strong>
                <small>{titleCase(tenant.type)} · {tenant._count?.companies ?? tenant.commercial?.companies.length ?? 0} companies</small>
              </span>
              <em className={`status-pill ${tenant.commercial?.subscription?.status ?? "suspended"}`}>{statusLabel(tenant.commercial?.subscription?.status)}</em>
            </button>
          ))}
          {tenants.length === 0 && <div className="project-empty">No tenants found</div>}
        </div>

        <div className="commercial-detail-panel">
          {selectedTenant ? (
            <>
              <div className="commercial-hero">
                <div>
                  <span className="eyebrow">Tenant Commercial Account</span>
                  <h2>{selectedTenant.name}</h2>
                  <p>{selectedTenant.commercial?.plan?.name ?? "No plan assigned"} · {statusLabel(selectedTenant.commercial?.subscription?.status)}</p>
                </div>
                <CheckCircle2 />
              </div>

              <div className="commercial-controls">
                <label className="field stacked">
                  <span>Plan</span>
                  <select
                    value={selectedTenant.commercial?.plan?.code ?? "internal"}
                    onChange={(event) => void updateSubscription(selectedTenant.id, event.target.value as PlanCode, selectedTenant.commercial?.subscription?.status ?? "active")}
                  >
                    {(plans.length ? plans.map((plan) => plan.code) : PLAN_CODES).map((code) => (
                      <option key={code} value={code}>{planLabel(code)}</option>
                    ))}
                  </select>
                </label>
                <label className="field stacked">
                  <span>Status</span>
                  <select
                    value={selectedTenant.commercial?.subscription?.status ?? "active"}
                    onChange={(event) => void updateSubscription(selectedTenant.id, selectedTenant.commercial?.plan?.code ?? "internal", event.target.value as SubscriptionStatus)}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <button className="secondary-action" onClick={() => void createCompany()} disabled={busy || !selectedTenant}>
                  <Building2 /> Add Company
                </button>
              </div>

              <div className="seat-card-grid">
                {(selectedTenant.commercial?.capacities ?? []).map((seat) => (
                  <button key={seat.seatType} className="license-card" onClick={() => void updateCapacity(selectedTenant.id, seat)}>
                    <span>{seatLabel(seat.seatType)}</span>
                    <strong>{seat.unlimited ? "Unlimited" : seat.total ?? 0}</strong>
                    <small>{seat.allocated ?? 0} allocated · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
                  </button>
                ))}
              </div>

              <div className="saas-panel commercial-table-panel">
                <div className="panel-heading-row">
                  <div>
                    <h2>Company Allocations</h2>
                    <p>Company admins can only assign seats inside these allocations.</p>
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
                    {(selectedTenant.commercial?.companies ?? []).map((company) => (
                      <tr key={company.id}>
                        <td><strong>{company.name}</strong><small>{company.memberCount} members</small></td>
                        {company.allocations.map((allocation) => (
                          <td key={allocation.seatType}>{seatCount(allocation)}<small>{allocation.assigned ?? 0} assigned</small></td>
                        ))}
                        <td>{company.projectCount}</td>
                      </tr>
                    ))}
                    {(selectedTenant.commercial?.companies ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="project-empty">No companies under this tenant</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="project-empty">Select a tenant to manage commercial settings.</div>
          )}
        </div>
      </section>
    </section>
  );
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

function statusLabel(status?: SubscriptionStatus) {
  return status ? titleCase(status.replace(/_/g, " ")) : "Not Assigned";
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
