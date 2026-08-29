import {
  Edit3,
  Home,
  MousePointer2,
  Redo2,
  RotateCcw,
  SunMedium,
  TrendingUp,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ReactNode } from "react";
import type { ViewMode } from "../../App";
import { DEFAULT_SCALE, clampScale } from "../../cad/viewport/viewport";
import { useCadStore } from "../../store/useCadStore";
import type { CadTool } from "../../types/cad";
import { ToolButton } from "./ToolButton";

const tools: Array<{ id: CadTool; label: string; shortcut: string; icon: ReactNode }> = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 /> },
  { id: "roof", label: "Roof Boundary", shortcut: "F", icon: <Home /> },
  { id: "solar", label: "Solar Panel", shortcut: "P", icon: <SunMedium /> },
  { id: "text", label: "Text", shortcut: "T", icon: <Type /> }
];

interface Props {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function LeftToolbar({ viewMode, setViewMode }: Props) {
  const activeTool = useCadStore((state) => state.activeTool);
  const viewport = useCadStore((state) => state.viewport);
  const setActiveTool = useCadStore((state) => state.setActiveTool);
  const setViewport = useCadStore((state) => state.setViewport);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  return (
    <aside className="left-toolbar">
      <button
        className={`tool-button mode-tool-button ${viewMode === "editor" ? "active" : ""}`}
        title="CAD Editor (E)"
        aria-label="CAD Editor"
        onClick={() => setViewMode("editor")}
      >
        <Edit3 />
      </button>
      <button
        className={`tool-button mode-tool-button ${viewMode === "energy" ? "active" : ""}`}
        title="Energy Analysis"
        aria-label="Energy Analysis"
        onClick={() => setViewMode("energy")}
      >
        <TrendingUp />
      </button>
      <div className="tool-divider" aria-hidden="true" />
      {tools.map((tool, index) => (
        <ToolButton
          key={`${tool.id}-${index}`}
          active={activeTool === tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => {
            setViewMode("editor");
            setActiveTool(tool.id);
          }}
        >
          {tool.icon}
        </ToolButton>
      ))}
      <div className="tool-divider" aria-hidden="true" />
      <button className="tool-button command-tool-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}>
        <Undo2 />
      </button>
      <button className="tool-button command-tool-button" title="Redo (Ctrl+Shift+Z or Ctrl+Y)" aria-label="Redo" onClick={redo}>
        <Redo2 />
      </button>
      <button
        className="tool-button command-tool-button"
        title="Zoom In"
        aria-label="Zoom In"
        onClick={() => setViewport({ ...viewport, scale: clampScale(viewport.scale * 1.15) })}
      >
        <ZoomIn />
      </button>
      <button
        className="tool-button command-tool-button"
        title="Zoom Out"
        aria-label="Zoom Out"
        onClick={() => setViewport({ ...viewport, scale: clampScale(viewport.scale / 1.15) })}
      >
        <ZoomOut />
      </button>
      <button
        className="tool-button command-tool-button"
        title="Reset Zoom"
        aria-label="Reset Zoom"
        onClick={() => setViewport({ x: 320, y: 120, scale: DEFAULT_SCALE })}
      >
        <RotateCcw />
      </button>
    </aside>
  );
}
