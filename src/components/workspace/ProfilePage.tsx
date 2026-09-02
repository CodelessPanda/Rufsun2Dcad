import { KeyRound, Monitor, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ApiUser, Tenant, UserSession, Workspace } from "../../api/types";
import { PageHeader } from "./WorkspaceShell";

export function ProfilePage({ user, activeTenant, activeWorkspace }: { user: ApiUser; activeTenant: Tenant; activeWorkspace: Workspace }) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.sessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  const changePassword = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Other refresh sessions were revoked.");
      setSessions(await api.sessions());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.revokeOtherSessions();
      setMessage("Other sessions revoked.");
      setSessions(await api.sessions());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke sessions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="saas-page profile-page">
      <PageHeader title="Profile" subtitle="Identity, password, and active sessions" />
      <section className="admin-grid">
        <div className="saas-panel">
          <div className="panel-heading-row">
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
            <span className={`status-pill ${user.status}`}>{user.status}</span>
          </div>
          <dl className="profile-list">
            <div><dt>Email</dt><dd>{user.emailVerifiedAt ? "Verified" : "Unverified"}</dd></div>
            <div><dt>Platform Role</dt><dd>{user.platformRole ?? "user"}</dd></div>
            <div><dt>Tenant</dt><dd>{activeTenant.name}</dd></div>
            <div><dt>Company</dt><dd>{activeWorkspace.name}</dd></div>
            <div><dt>Company Role</dt><dd>{activeWorkspace.role ?? "-"}</dd></div>
            <div><dt>Seat</dt><dd>{activeWorkspace.seatType ?? "-"}</dd></div>
          </dl>
        </div>
        <div className="saas-panel">
          <div className="panel-heading-row">
            <div>
              <h2>Password</h2>
              <p>Change your password and revoke other sessions.</p>
            </div>
            <KeyRound />
          </div>
          <label className="field stacked">
            <span>Current Password</span>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="field stacked">
            <span>New Password</span>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <div className="layout-actions">
            <button className="primary-action compact" disabled={busy || !currentPassword || newPassword.length < 8} onClick={() => void changePassword()}>
              <KeyRound /> Change
            </button>
            <button className="ghost-button compact" disabled={busy} onClick={() => void revokeOthers()}>
              <RotateCcw /> Sign Out Others
            </button>
          </div>
          {message && <p className="form-note">{message}</p>}
        </div>
      </section>
      <section className="saas-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Sessions</h2>
            <p>Refresh sessions remain valid until expiry or revocation.</p>
          </div>
          <Monitor />
        </div>
        <table className="project-table session-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Last Used</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className="session-device-cell">
                  <strong title={session.userAgent || undefined}>{formatDeviceLabel(session.userAgent)}</strong>
                  {session.ipAddress && <small>{session.ipAddress}</small>}
                </td>
                <td>{session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString() : "-"}</td>
                <td>{new Date(session.expiresAt).toLocaleDateString()}</td>
                <td><span className={`status-pill ${session.revokedAt ? "suspended" : "active"}`}>{session.revokedAt ? "revoked" : "active"}</span></td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={4} className="project-empty">No sessions found</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function formatDeviceLabel(userAgent?: string | null) {
  if (!userAgent) return "Unknown device";

  const browser =
    /Edg\//.test(userAgent) ? "Microsoft Edge" :
    /Chrome\//.test(userAgent) ? "Chrome" :
    /Firefox\//.test(userAgent) ? "Firefox" :
    /Safari\//.test(userAgent) ? "Safari" :
    "Browser";

  const os =
    /Windows/.test(userAgent) ? "Windows" :
    /Mac OS X/.test(userAgent) ? "macOS" :
    /Android/.test(userAgent) ? "Android" :
    /iPhone|iPad/.test(userAgent) ? "iOS" :
    /Linux/.test(userAgent) ? "Linux" :
    "device";

  return `${browser} on ${os}`;
}
