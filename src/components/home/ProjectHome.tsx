import { FolderOpen, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SavedProject } from "../../persistence/db";

interface Props {
  projects: SavedProject[];
  googleMapsApiKey: string;
  onSaveGoogleMapsApiKey: (apiKey: string) => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export function ProjectHome({ projects, googleMapsApiKey, onSaveGoogleMapsApiKey, onNewProject, onOpenProject, onDeleteProject }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(googleMapsApiKey);

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">R</span>
          <strong>RufsunCAD</strong>
        </div>
        <div className="home-actions">
          <button className="home-settings-btn" onClick={() => setSettingsOpen((open) => !open)}>
            <KeyRound /> Settings
          </button>
          <button className="home-new-btn" onClick={onNewProject}>
            <Plus /> New Project
          </button>
        </div>
      </header>

      <main className="home-content">
        {settingsOpen && (
          <section className="settings-panel">
            <h2>Settings</h2>
            <label className="field stacked">
              <span>Google Maps API key</span>
              <input
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder="Paste API key"
              />
            </label>
            <button onClick={() => onSaveGoogleMapsApiKey(apiKeyDraft)}>Save Settings</button>
          </section>
        )}
        <section className="project-list-shell">
          <div className="project-list-head">
            <h1>Projects</h1>
            <span>{projects.length} total</span>
          </div>
          <div className="project-table-wrap">
            <table className="project-table">
              <thead>
                <tr>
                  <th>Name of customer</th>
                  <th>Address</th>
                  <th>Date created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="project-empty">
                      No projects yet
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <strong>{project.customerName || project.document.name}</strong>
                      </td>
                      <td>{project.address || "-"}</td>
                      <td>{formatDate(project.createdAt)}</td>
                      <td className="project-actions">
                        <button onClick={() => void onOpenProject(project.id)}>
                          <FolderOpen /> Open
                        </button>
                        <button
                          className="danger"
                          title="Delete project"
                          onClick={() => {
                            const name = project.customerName || project.document.name;
                            if (window.confirm(`Delete project for ${name}? This cannot be undone.`)) {
                              void onDeleteProject(project.id);
                            }
                          }}
                        >
                          <Trash2 />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
