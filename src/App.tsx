import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type Konva from "konva";
import { CadCanvas } from "./components/canvas/CadCanvas";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ContextMenu } from "./components/layout/ContextMenu";
import { LeftToolbar } from "./components/layout/LeftToolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { TopBar } from "./components/layout/TopBar";
import { PropertiesPanel } from "./components/panels/PropertiesPanel";
import { EnergyAnalysisPanel } from "./components/analysis/EnergyAnalysisPanel";
import { NewProjectDialog } from "./components/home/NewProjectDialog";
import { ProjectHome } from "./components/home/ProjectHome";
import { createProject, deleteProject, listProjects, loadProject, saveProject, type SavedProject } from "./persistence/db";
import { useCadStore } from "./store/useCadStore";
import { documentSchema } from "./schemas/documentSchema";
import type { MapCaptureSettings } from "./types/cad";

export type ViewMode = "editor" | "energy";

export function App() {
  const stageRef = useRef<Konva.Stage>(null);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<"home" | "designer">("home");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(() => localStorage.getItem("rufsun.googleMapsApiKey") ?? "");
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("rufsun.panelWidth"));
    return saved >= 280 && saved <= 1600 ? saved : 310;
  });
  const document = useCadStore((state) => state.document);
  const setDocument = useCadStore((state) => state.setDocument);
  const setAutosaveStatus = useCadStore((state) => state.setAutosaveStatus);
  const deleteSelected = useCadStore((state) => state.deleteSelected);
  const copySelected = useCadStore((state) => state.copySelected);
  const paste = useCadStore((state) => state.paste);
  const duplicateSelected = useCadStore((state) => state.duplicateSelected);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const setDraft = useCadStore((state) => state.setDraft);
  const setGuides = useCadStore((state) => state.setGuides);

  useEffect(() => {
    localStorage.setItem("rufsun.panelWidth", String(panelWidth));
  }, [panelWidth]);

  useEffect(() => {
    const onResize = () => {
      setPanelWidth((width) => Math.min(width, Math.max(280, window.innerWidth - 76)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const maxWidth = Math.max(280, window.innerWidth - 76);
    const onMove = (moveEvent: MouseEvent) => {
      setPanelWidth(Math.min(maxWidth, Math.max(280, startWidth + (startX - moveEvent.clientX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      globalThis.document.body.style.cursor = "";
    };
    globalThis.document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (viewMode === "energy") {
      setDraft(null);
      setGuides([]);
    }
  }, [viewMode, setDraft, setGuides]);

  useEffect(() => {
    void refreshProjects()
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded || screen !== "designer" || !activeProjectId) return;
    setAutosaveStatus("saving");
    const timeout = window.setTimeout(() => {
      void saveProject(activeProjectId, document)
        .then(() => {
          setAutosaveStatus("saved");
          void refreshProjects();
        })
        .catch(() => setAutosaveStatus("error"));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [activeProjectId, document, loaded, screen, setAutosaveStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if ((event.key === "Delete" || event.key === "Backspace") && !ctrl) {
        deleteSelected();
        event.preventDefault();
      }
      if (!ctrl) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        copySelected();
        event.preventDefault();
      }
      if (key === "v") {
        paste();
        event.preventDefault();
      }
      if (key === "d") {
        duplicateSelected();
        event.preventDefault();
      }
      if (key === "z" && event.shiftKey) {
        redo();
        event.preventDefault();
      } else if (key === "z") {
        undo();
        event.preventDefault();
      }
      if (key === "y") {
        redo();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelected, deleteSelected, duplicateSelected, paste, redo, undo]);

  const refreshProjects = async () => {
    setProjects(await listProjects());
  };

  const openProject = async (id: string) => {
    const project = await loadProject(id);
    if (!project) return;
    const parsed = documentSchema.safeParse(project);
    if (!parsed.success) {
      window.alert("Project could not be opened.");
      return;
    }
    setDocument(parsed.data, false);
    setActiveProjectId(id);
    setViewMode("editor");
    setScreen("designer");
  };

  const removeProject = async (id: string) => {
    await deleteProject(id);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setScreen("home");
      setViewMode("editor");
    }
    await refreshProjects();
  };

  const saveGoogleMapsApiKey = (apiKey: string) => {
    const trimmed = apiKey.trim();
    localStorage.setItem("rufsun.googleMapsApiKey", trimmed);
    setGoogleMapsApiKey(trimmed);
  };

  const makeProject = async (customerName: string, address: string, mapCapture?: MapCaptureSettings) => {
    setProjectBusy(true);
    try {
      const project = await createProject(customerName, address, mapCapture);
      setDocument(project.document, false);
      setActiveProjectId(project.id);
      setViewMode("editor");
      setScreen("designer");
      setNewProjectOpen(false);
      await refreshProjects();
    } finally {
      setProjectBusy(false);
    }
  };

  const showProjects = () => {
    setScreen("home");
    setViewMode("editor");
    void refreshProjects();
  };

  return (
    <ErrorBoundary>
      {screen === "home" ? (
        <ProjectHome
          projects={projects}
          googleMapsApiKey={googleMapsApiKey}
          onSaveGoogleMapsApiKey={saveGoogleMapsApiKey}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenProject={openProject}
          onDeleteProject={removeProject}
        />
      ) : (
        <div className="app-shell">
          <TopBar
            stageRef={stageRef}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onShowProjects={showProjects}
          />
          <main className="editor-grid" style={{ "--panel-width": `${panelWidth}px` } as CSSProperties}>
            {viewMode === "editor" ? (
              <>
                <LeftToolbar />
                <CadCanvas stageRef={stageRef} />
                <div className="panel-resize-handle" onMouseDown={startResize} />
                <PropertiesPanel />
              </>
            ) : (
              <>
                <div className="left-toolbar" />
                <CadCanvas stageRef={stageRef} readOnly />
                <div className="panel-resize-handle" onMouseDown={startResize} />
                <EnergyAnalysisPanel />
              </>
            )}
          </main>
          {viewMode === "editor" && <StatusBar />}
          <ContextMenu />
        </div>
      )}
      <NewProjectDialog
        open={newProjectOpen}
        busy={projectBusy}
        googleMapsApiKey={googleMapsApiKey}
        onCancel={() => setNewProjectOpen(false)}
        onCreate={makeProject}
      />
    </ErrorBoundary>
  );
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}
