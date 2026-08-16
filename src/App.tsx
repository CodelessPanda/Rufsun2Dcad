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
import { loadLastProject, saveLastProject } from "./persistence/db";
import { useCadStore } from "./store/useCadStore";
import { documentSchema } from "./schemas/documentSchema";

export type ViewMode = "editor" | "energy";

export function App() {
  const stageRef = useRef<Konva.Stage>(null);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
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
    void loadLastProject()
      .then((project) => {
        if (project) {
          const parsed = documentSchema.safeParse(project);
          if (parsed.success) setDocument(parsed.data, false);
        }
      })
      .finally(() => setLoaded(true));
  }, [setDocument]);

  useEffect(() => {
    if (!loaded) return;
    setAutosaveStatus("saving");
    const timeout = window.setTimeout(() => {
      void saveLastProject(document)
        .then(() => setAutosaveStatus("saved"))
        .catch(() => setAutosaveStatus("error"));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [document, loaded, setAutosaveStatus]);

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

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <TopBar stageRef={stageRef} viewMode={viewMode} setViewMode={setViewMode} />
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
    </ErrorBoundary>
  );
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}
