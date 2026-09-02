import { MailPlus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CompanyCommercialSummary, CompanyMember, CompanyRole, Invitation, MembershipStatus, SeatType } from "../../api/types";
import { can, roleLabel, seatLabel, UiPermissions } from "../../authz/permissions";
import { PageHeader } from "./WorkspaceShell";

const COMPANY_ROLES: CompanyRole[] = ["company_owner", "company_admin", "design_manager", "designer", "sales_manager", "sales_rep", "project_viewer"];
const SEATS: SeatType[] = ["designer", "sales", "viewer", "no_seat"];

export function TeamPage({
  members,
  invitations,
  licensing,
  activeRole,
  onInvite,
  onUpdateMember,
  onRemoveMember,
  onRevokeInvitation
}: {
  members: CompanyMember[];
  invitations: Invitation[];
  licensing?: CompanyCommercialSummary | null;
  activeRole?: CompanyRole;
  onInvite: (input: { email: string; role: CompanyRole; seatType: SeatType }) => Promise<void>;
  onUpdateMember: (membershipId: string, input: { role?: CompanyRole; seatType?: SeatType; status?: MembershipStatus }) => Promise<void>;
  onRemoveMember: (membershipId: string) => Promise<void>;
  onRevokeInvitation: (invitationId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("designer");
  const [seatType, setSeatType] = useState<SeatType>("designer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canInvite = can(activeRole, UiPermissions.MEMBERS_INVITE);
  const canUpdate = can(activeRole, UiPermissions.MEMBERS_UPDATE);
  const canRemove = can(activeRole, UiPermissions.MEMBERS_REMOVE);

  const submitInvite = async () => {
    setBusy(true);
    setMessage("");
    try {
      await onInvite({ email, role, seatType });
      setEmail("");
      setMessage("Invitation created. In development, the invite link is also printed in the backend terminal.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite member.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="saas-page team-page">
      <PageHeader title="Team" subtitle="Company members, roles, seats, and invitations" />

      {licensing && (
        <section className="saas-panel company-license-panel">
          <div className="panel-heading-row">
            <div>
              <h2>Company Licensing</h2>
              <p>{licensing.plan?.name ?? "No plan assigned"} · {statusLabel(licensing.subscription?.status)}</p>
            </div>
          </div>
          <div className="seat-card-grid">
            {licensing.seats.map((seat) => (
              <div key={seat.seatType} className="license-card">
                <span>{seatLabel(seat.seatType)}</span>
                <strong>{seat.unlimited ? "Unlimited" : seat.allocated ?? 0}</strong>
                <small>{seat.assigned ?? 0} assigned · {seat.available === null ? "unlimited" : `${seat.available} available`}</small>
              </div>
            ))}
          </div>
          <p className="form-note">
            Solar API usage this month: {licensing.usage.solarRequestsMonth.used}
            {licensing.entitlements["solar.requests.month"]?.limit === null ? " of unlimited" : ` of ${licensing.entitlements["solar.requests.month"]?.limit ?? 0}`}
          </p>
        </section>
      )}

      {canInvite && (
        <section className="saas-panel team-invite-panel">
          <div className="panel-heading-row">
            <div>
              <h2>Invite Member</h2>
              <p>Invite by email without exposing the global user directory.</p>
            </div>
            <ShieldCheck />
          </div>
          <div className="team-invite-grid">
            <label className="field stacked">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" />
            </label>
            <label className="field stacked">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as CompanyRole)}>
                {COMPANY_ROLES.map((option) => (
                  <option key={option} value={option}>{roleLabel(option)}</option>
                ))}
              </select>
            </label>
            <label className="field stacked">
              <span>Seat</span>
              <select value={seatType} onChange={(event) => setSeatType(event.target.value as SeatType)}>
                {SEATS.map((option) => (
                  <option key={option} value={option}>{seatLabel(option)}</option>
                ))}
              </select>
            </label>
            <button className="primary-action compact" disabled={busy || !email.trim()} onClick={() => void submitInvite()}>
              <MailPlus /> Invite
            </button>
          </div>
          {message && <p className="form-note">{message}</p>}
        </section>
      )}

      <section className="saas-panel">
        <table className="project-table team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Seat</th>
              <th>Status</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td><strong>{member.user.name}</strong></td>
                <td>
                  {member.user.email}
                  {!member.user.emailVerifiedAt && <small>Unverified</small>}
                </td>
                <td>
                  {canUpdate ? (
                    <select value={member.role} onChange={(event) => void onUpdateMember(member.id, { role: event.target.value as CompanyRole })}>
                      {COMPANY_ROLES.map((option) => (
                        <option key={option} value={option}>{roleLabel(option)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="status-pill">{roleLabel(member.role)}</span>
                  )}
                </td>
                <td>
                  {canUpdate ? (
                    <select value={member.seatType ?? "viewer"} onChange={(event) => void onUpdateMember(member.id, { seatType: event.target.value as SeatType })}>
                      {SEATS.map((option) => (
                        <option key={option} value={option}>{seatLabel(option)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="status-pill">{member.seatType ? seatLabel(member.seatType) : "No Seat"}</span>
                  )}
                </td>
                <td>
                  <span className={`status-pill ${member.status}`}>{statusLabel(member.status)}</span>
                </td>
                <td>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "-"}</td>
                <td className="table-actions">
                  {canUpdate && (
                    <button
                      className="ghost-button compact"
                      onClick={() => void onUpdateMember(member.id, { status: member.status === "active" ? "suspended" : "active" })}
                    >
                      {member.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  )}
                  {canRemove && (
                    <button
                      className="icon-button danger"
                      title="Remove member"
                      onClick={() => window.confirm("Remove this company member?") && void onRemoveMember(member.id)}
                    >
                      <Trash2 />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={7} className="project-empty">No company members found</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="saas-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Pending Invitations</h2>
            <p>Open invites expire automatically and can be revoked.</p>
          </div>
        </div>
        <table className="project-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Seat</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>
                  <strong>{invitation.email}</strong>
                  {invitation.invitationUrl && <small>{invitation.invitationUrl}</small>}
                </td>
                <td>{invitation.companyRole ? roleLabel(invitation.companyRole) : "-"}</td>
                <td>{invitation.seatType ? seatLabel(invitation.seatType) : "-"}</td>
                <td>{new Date(invitation.expiresAt).toLocaleDateString()}</td>
                <td className="table-actions">
                  {canRemove && (
                    <button className="ghost-button compact" onClick={() => void onRevokeInvitation(invitation.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invitations.length === 0 && (
              <tr>
                <td colSpan={5} className="project-empty">No pending invitations</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function statusLabel(status?: string | null) {
  return status ? status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not Assigned";
}
