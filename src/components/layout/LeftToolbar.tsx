import {
  Circle,
  DraftingCompass,
  Hand,
  Home,
  MousePointer2,
  PenLine,
  Ruler,
  ScanLine,
  Square,
  SunMedium,
  Type
} from "lucide-react";
import type { ReactNode } from "react";
import { useCadStore } from "../../store/useCadStore";
import type { CadTool } from "../../types/cad";
import { ToolButton } from "./ToolButton";

const tools: Array<{ id: CadTool; label: string; shortcut: string; icon: ReactNode }> = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 /> },
  { id: "pan", label: "Pan", shortcut: "Space", icon: <Hand /> },
  { id: "roof", label: "Roof Boundary", shortcut: "F", icon: <Home /> },
  { id: "solar", label: "Solar Panel", shortcut: "P", icon: <SunMedium /> },
  { id: "line", label: "Line", shortcut: "L", icon: <PenLine /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: <Square /> },
  { id: "circle", label: "Circle", shortcut: "C", icon: <Circle /> },
  { id: "dimension", label: "Dimension", shortcut: "D", icon: <ScanLine /> },
  { id: "measure", label: "Measure", shortcut: "M", icon: <Ruler /> },
  { id: "text", label: "Text", shortcut: "T", icon: <Type /> },
  { id: "select", label: "Transformer", shortcut: "Select object", icon: <DraftingCompass /> }
];

export function LeftToolbar() {
  const activeTool = useCadStore((state) => state.activeTool);
  const setActiveTool = useCadStore((state) => state.setActiveTool);
  return (
    <aside className="left-toolbar">
      {tools.map((tool, index) => (
        <ToolButton
          key={`${tool.id}-${index}`}
          active={activeTool === tool.id && index !== tools.length - 1}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => setActiveTool(tool.id)}
        >
          {tool.icon}
        </ToolButton>
      ))}
    </aside>
  );
}
