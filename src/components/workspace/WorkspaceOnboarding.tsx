import { Building2 } from "lucide-react";
import { useState } from "react";

interface Props {
  busy: boolean;
  error: string;
  onCreateWorkspace: (name: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function WorkspaceOnboarding({ busy, error, onCreateWorkspace, onLogout }: Props) {
  const [name, setName] = useState("");

  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreateWorkspace(name);
        }}
      >
        <div className="auth-brand">
          <span className="brand-mark">R</span>
          <strong>RufsunCAD</strong>
        </div>
        <h1>Create workspace</h1>
        <p className="fine-print">This workspace represents your solar company.</p>
        <label className="field stacked">
          <span>Workspace name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="ABC Solar Pvt Ltd" />
        </label>
        {error && <p className="warning">{error}</p>}
        <button className="auth-primary" disabled={busy || !name.trim()}>
          <Building2 /> Create Workspace
        </button>
        <button type="button" className="auth-link" onClick={() => void onLogout()}>
          Logout
        </button>
      </form>
    </div>
  );
}
