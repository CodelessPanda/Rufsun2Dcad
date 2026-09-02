import { useEffect, useState } from "react";
import type { Workspace } from "../../api/types";
import { useCadStore } from "../../store/useCadStore";
import { PageHeader } from "./WorkspaceShell";

interface Props {
  workspace: Workspace;
  busy: boolean;
  error: string;
  onSave: (input: Partial<Workspace>) => Promise<void>;
}

export function WorkspaceSettingsPage({ workspace, busy, error, onSave }: Props) {
  const [form, setForm] = useState<Partial<Workspace>>(workspace);
  const document = useCadStore((state) => state.document);
  const setDocument = useCadStore((state) => state.setDocument);

  useEffect(() => {
    setForm(workspace);
  }, [workspace]);

  const update = (key: keyof Workspace, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="saas-page">
      <PageHeader title="Company Settings" subtitle="Basic company profile" />
      <form
        className="saas-panel settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <label className="field stacked">
          <span>Company Name</span>
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
        <section className="settings-subsection">
          <h2>Designer Grid</h2>
          <Toggle
            label="Visible"
            checked={document.settings.grid.visible}
            onChange={(visible) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, visible } } })}
          />
          <div className="form-grid-two">
            <NumberField
              label="Minor"
              value={document.settings.grid.minor}
              suffix="mm"
              onCommit={(minor) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, minor: Math.max(1, minor) } } })}
            />
            <NumberField
              label="Major"
              value={document.settings.grid.major}
              suffix="mm"
              onCommit={(major) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, major: Math.max(1, major) } } })}
            />
          </div>
        </section>
        {error && <p className="warning">{error}</p>}
        <button className="primary-action settings-save" disabled={busy || !form.name?.trim()}>
          {busy ? "Saving..." : "Save Company"}
        </button>
      </form>
    </section>
  );
}

function NumberField({ label, value, suffix, onCommit }: { label: string; value: number; suffix?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(round(value)));
  };
  return (
    <label className="field stacked number-field">
      <span>{label}</span>
      <div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row settings-toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
