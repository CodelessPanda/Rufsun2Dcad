import type Konva from "konva";
import { Download, FileDown, FileInput, FilePlus2, FolderOpen, Redo2, RotateCcw, Save, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { jsPDF } from "jspdf";
import { useRef, type RefObject } from "react";
import { useCadStore } from "../../store/useCadStore";
import { BASE_SCALE, clampScale, zoomPercent } from "../../cad/viewport/viewport";
import { documentSchema } from "../../schemas/documentSchema";
import { selectedSolarStats } from "../../store/useCadStore";

interface Props {
  stageRef: RefObject<Konva.Stage>;
}

export function TopBar({ stageRef }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const document = useCadStore((state) => state.document);
  const viewport = useCadStore((state) => state.viewport);
  const setViewport = useCadStore((state) => state.setViewport);
  const setDocument = useCadStore((state) => state.setDocument);
  const newProject = useCadStore((state) => state.newProject);
  const loadDemo = useCadStore((state) => state.loadDemo);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const clearSelection = useCadStore((state) => state.clearSelection);
  const stats = selectedSolarStats(document.objects, document.objects.filter((object) => object.type === "solarPanel").map((object) => object.id));

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${document.name.replace(/\s+/g, "-").toLowerCase()}.rufcad`);
  };

  const importProject = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = documentSchema.parse(JSON.parse(raw));
      setDocument(parsed);
    } catch (error) {
      window.alert(`Project could not be opened: ${error instanceof Error ? error.message : "Invalid RufsunCAD file"}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportPng = () => {
    clearSelection();
    requestAnimationFrame(() => {
      const dataUrl = captureDrawingDataUrl(stageRef.current);
      if (!dataUrl) return;
      downloadDataUrl(dataUrl, `${document.name.replace(/\s+/g, "-").toLowerCase()}.png`);
    });
  };

  const exportPdf = () => {
    clearSelection();
    requestAnimationFrame(() => {
      const image = captureDrawingDataUrl(stageRef.current);
      if (!image) return;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
      pdf.setFontSize(18);
      pdf.text(document.name, 16, 16);
      pdf.setFontSize(10);
      pdf.text(`Solar modules: ${stats.modules} | DC capacity: ${stats.totalKwp.toFixed(2)} kWp`, 16, 24);
      pdf.addImage(image, "PNG", 16, 32, 388, 235);
      pdf.save(`${document.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    });
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">R</span>
        <strong>RufsunCAD</strong>
      </div>
      <nav className="menu-strip" aria-label="Project commands">
        <button onClick={newProject} title="New Project">
          <FilePlus2 /> New
        </button>
        <button onClick={loadDemo} title="Load Demo Project">
          <FolderOpen /> Demo
        </button>
        <button onClick={() => fileInputRef.current?.click()} title="Open RufsunCAD Project">
          <FileInput /> Open
        </button>
        <button onClick={exportProject} title="Export RufsunCAD Project">
          <Save /> Export
        </button>
        <button onClick={exportPng} title="Export PNG">
          <Download /> PNG
        </button>
        <button onClick={exportPdf} title="Export PDF">
          <FileDown /> PDF
        </button>
      </nav>
      <div className="topbar-spacer" />
      <div className="command-cluster">
        <button onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 />
        </button>
        <button onClick={redo} title="Redo (Ctrl+Shift+Z or Ctrl+Y)">
          <Redo2 />
        </button>
        <button onClick={() => setViewport({ ...viewport, scale: clampScale(viewport.scale * 1.15) })} title="Zoom In">
          <ZoomIn />
        </button>
        <button onClick={() => setViewport({ ...viewport, scale: clampScale(viewport.scale / 1.15) })} title="Zoom Out">
          <ZoomOut />
        </button>
        <button onClick={() => setViewport({ x: 320, y: 120, scale: BASE_SCALE })} title="Reset Zoom">
          <RotateCcw />
        </button>
        <span className="zoom-pill">Zoom {zoomPercent(viewport.scale)}%</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".rufcad,.json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importProject(file);
        }}
      />
    </header>
  );
}

function captureDrawingDataUrl(stage?: Konva.Stage | null) {
  if (!stage) return null;
  const layers = stage.getLayers();
  const previousVisibility = layers.map((layer) => layer.visible());
  layers.forEach((layer, index) => {
    layer.visible(index === 1);
  });
  stage.batchDraw();
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
  layers.forEach((layer, index) => {
    layer.visible(previousVisibility[index]);
  });
  stage.batchDraw();
  return dataUrl;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
