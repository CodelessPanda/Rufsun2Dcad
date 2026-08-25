import type Konva from "konva";
import { ChevronDown, Download, FileDown, Home, Redo2, RotateCcw, Save, Undo2, ZoomIn, ZoomOut, TrendingUp, Edit3 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ViewMode } from "../../App";
import { useCadStore } from "../../store/useCadStore";
import { DEFAULT_SCALE, clampScale, zoomPercent } from "../../cad/viewport/viewport";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";
import { exportProjectReportPdf } from "../../reports/projectReport";

interface Props {
  stageRef: RefObject<Konva.Stage>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onShowProjects: () => void;
  cloudSaveStatus?: "idle" | "saving" | "saved" | "offline" | "error";
  solarExposure?: ProjectSolarDataState;
}

export function TopBar({ stageRef, viewMode, setViewMode, onShowProjects, cloudSaveStatus = "idle", solarExposure }: Props) {
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const document = useCadStore((state) => state.document);
  const viewport = useCadStore((state) => state.viewport);
  const setViewport = useCadStore((state) => state.setViewport);
  const setProjectName = useCadStore((state) => state.setProjectName);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const clearSelection = useCadStore((state) => state.clearSelection);
  const [projectNameDraft, setProjectNameDraft] = useState(document.name);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    setProjectNameDraft(document.name);
  }, [document.name]);

  const commitProjectName = () => {
    const trimmed = projectNameDraft.trim();
    if (!trimmed) {
      setProjectNameDraft(document.name);
      return;
    }
    if (trimmed !== document.name) setProjectName(trimmed);
  };

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [exportMenuOpen]);

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${document.name.replace(/\s+/g, "-").toLowerCase()}.rufcad`);
  };

  const runExport = (exporter: () => void) => {
    setExportMenuOpen(false);
    exporter();
  };


  const exportPng = () => {
    clearSelection();
    requestAnimationFrame(async () => {
      const dataUrl = captureDrawingDataUrl(stageRef.current);
      if (!dataUrl) return;
      const whiteBackgroundDataUrl = await addWhitePngBackground(dataUrl);
      downloadDataUrl(whiteBackgroundDataUrl, `${document.name.replace(/\s+/g, "-").toLowerCase()}.png`);
    });
  };

  const exportPdf = () => {
    clearSelection();
    requestAnimationFrame(() => {
      void exportProjectReportPdf({ document, stage: stageRef.current, solarExposure });
    });
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">R</span>
        <strong>RufsunCAD</strong>
      </div>
      <input
        className="project-name-input"
        aria-label="Project name"
        value={projectNameDraft}
        onChange={(event) => setProjectNameDraft(event.target.value)}
        onBlur={commitProjectName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setProjectNameDraft(document.name);
            event.currentTarget.blur();
          }
        }}
      />
      <nav className="menu-strip" aria-label="Project commands">
        <div className="export-menu" ref={exportMenuRef}>
          <button
            className="export-trigger"
            onClick={() => setExportMenuOpen((open) => !open)}
            title="Export"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
          >
            <Save /> Export <ChevronDown />
          </button>
          {exportMenuOpen && (
            <div className="export-dropdown" role="menu">
              <button role="menuitem" onClick={() => runExport(exportProject)}>
                <Save /> Default (.rufcad)
              </button>
              <button role="menuitem" onClick={() => runExport(exportPng)}>
                <Download /> PNG
              </button>
              <button role="menuitem" onClick={() => runExport(exportPdf)}>
                <FileDown /> PDF
              </button>
            </div>
          )}
        </div>
      </nav>
      <div className="topbar-spacer" />
      <span className={`cloud-save-pill ${cloudSaveStatus}`}>
        {cloudSaveLabel(cloudSaveStatus)}
      </span>
      <div className="view-switcher">
        <button
          className={`view-btn ${viewMode === "editor" ? "active" : ""}`}
          onClick={() => setViewMode("editor")}
          title="CAD Editor (E)"
        >
          <Edit3 size={18} />
          Editor
        </button>
        <button
          className={`view-btn ${viewMode === "energy" ? "active" : ""}`}
          onClick={() => setViewMode("energy")}
          title="Energy Analysis"
        >
          <TrendingUp size={18} />
          Analysis
        </button>
      </div>
      <div className="topbar-spacer" />
      <div className="command-cluster">
        <span className="editor-command-set" style={viewMode !== "editor" ? { visibility: "hidden" } : undefined}>
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
          <button onClick={() => setViewport({ x: 320, y: 120, scale: DEFAULT_SCALE })} title="Reset Zoom">
            <RotateCcw />
          </button>
          <span className="zoom-pill">Zoom {zoomPercent(viewport.scale)}%</span>
        </span>
        <button className="designer-projects-btn" onClick={onShowProjects} title="Back to Projects">
          <Home /> Back to Projects
        </button>
      </div>
    </header>
  );
}

function cloudSaveLabel(status: NonNullable<Props["cloudSaveStatus"]>) {
  if (status === "saving") return "Saving...";
  if (status === "saved") return "Saved to cloud";
  if (status === "offline") return "Offline - saved locally";
  if (status === "error") return "Sync failed - retrying";
  return "Local ready";
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

function addWhitePngBackground(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
