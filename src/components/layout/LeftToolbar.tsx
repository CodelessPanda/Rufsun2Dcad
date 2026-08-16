import {
  Home,
  MousePointer2,
  SunMedium,
  Type
} from "lucide-react";
import type { ReactNode } from "react";
import { useCadStore } from "../../store/useCadStore";
import type { CadTool } from "../../types/cad";
import { ToolButton } from "./ToolButton";

const tools: Array<{ id: CadTool; label: string; shortcut: string; icon: ReactNode }> = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 /> },
  { id: "roof", label: "Roof Boundary", shortcut: "F", icon: <Home /> },
  { id: "solar", label: "Solar Panel", shortcut: "P", icon: <SunMedium /> },
  { id: "text", label: "Text", shortcut: "T", icon: <Type /> }
];

export function LeftToolbar() {
  const activeTool = useCadStore((state) => state.activeTool);
  const setActiveTool = useCadStore((state) => state.setActiveTool);
  return (
    <aside className="left-toolbar">
      {tools.map((tool, index) => (
        <ToolButton
          key={`${tool.id}-${index}`}
          active={activeTool === tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => setActiveTool(tool.id)}
        >
          {tool.icon}
        </ToolButton>
      ))}
    </aside>
  );
}
