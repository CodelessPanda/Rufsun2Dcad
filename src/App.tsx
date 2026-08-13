import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { CadCanvas } from "./components/canvas/CadCanvas";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ContextMenu } from "./components/layout/ContextMenu";
import { LeftToolbar } from "./components/layout/LeftToolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { TopBar } from "./components/layout/TopBar";
import { PropertiesPanel } from "./components/panels/PropertiesPanel";
import { loadLastProject, saveLastProject } from "./persistence/db";
import { useCadStore } from "./store/useCadStore";
import { documentSchema } from "./schemas/documentSchema";

export function App() {
  const stageRef = useRef<Konva.Stage>(null);
  const [loaded, setLoaded] = useState(false);
  const document = useCadStore((state) => state.document);
  const setDocument = useCadStore((state) => state.setDocument);
  const setAutosaveStatus = useCadStore((state) => state.setAutosaveStatus);
  const deleteSelected = useCadStore((state) => state.deleteSelected);
  const copySelected = useCadStore((state) => state.copySelected);
  const paste = useCadStore((state) => state.paste);
  const duplicateSelected = useCadStore((state) => state.duplicateSelected);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);

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
        <TopBar stageRef={stageRef} />
        <main className="editor-grid">
          <LeftToolbar />
          <CadCanvas stageRef={stageRef} />
          <PropertiesPanel />
        </main>
        <StatusBar />
        <ContextMenu />
      </div>
    </ErrorBoundary>
  );
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}
