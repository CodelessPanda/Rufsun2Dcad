import { useEffect, useState } from "react";
import type { Workspace } from "../../api/types";
import { PageHeader } from "./WorkspaceShell";

interface Props {
  workspace: Workspace;
  busy: boolean;
  error: string;
  onSave: (input: Partial<Workspace>) => Promise<void>;
}

export function WorkspaceSettingsPage({ workspace, busy, error, onSave }: Props) {
  const [form, setForm] = useState<Partial<Workspace>>(workspace);

  useEffect(() => {
    setForm(workspace);
  }, [workspace]);

  const update = (key: keyof Workspace, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="saas-page">
      <PageHeader title="Workspace Settings" subtitle="Basic company profile" />
      <form
        className="saas-panel settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <label className="field stacked">
          <span>Workspace Name</span>
          <input value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} />
        </label>
        <label className="field stacked">
          <span>Logo URL</span>
          <input value={form.logoUrl ?? ""} onChange={(event) => update("logoUrl", event.target.value)} />
        </label>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>Email</span>
            <input value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label className="field stacked">
            <span>Phone</span>
            <input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} />
          </label>
        </div>
        <label className="field stacked">
          <span>Website</span>
          <input value={form.website ?? ""} onChange={(event) => update("website", event.target.value)} />
        </label>
        <label className="field stacked">
          <span>Address</span>
          <input value={form.address ?? ""} onChange={(event) => update("address", event.target.value)} />
        </label>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>City</span>
            <input value={form.city ?? ""} onChange={(event) => update("city", event.target.value)} />
          </label>
          <label className="field stacked">
            <span>State</span>
            <input value={form.state ?? ""} onChange={(event) => update("state", event.target.value)} />
          </label>
        </div>
        <div className="form-grid-two">
          <label className="field stacked">
            <span>Postal Code</span>
            <input value={form.postalCode ?? ""} onChange={(event) => update("postalCode", event.target.value)} />
          </label>
          <label className="field stacked">
            <span>Country</span>
            <input value={form.country ?? ""} onChange={(event) => update("country", event.target.value)} />
          </label>
        </div>
        {error && <p className="warning">{error}</p>}
        <button className="primary-action settings-save" disabled={busy || !form.name?.trim()}>
          {busy ? "Saving..." : "Save Workspace"}
        </button>
      </form>
    </section>
  );
}
