import type Konva from "konva";
import { ChevronDown, Download, FileDown, Home, Redo2, RotateCcw, Save, Undo2, ZoomIn, ZoomOut, TrendingUp, Edit3 } from "lucide-react";
import { jsPDF } from "jspdf";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ViewMode } from "../../App";
import { useCadStore } from "../../store/useCadStore";
import { DEFAULT_SCALE, clampScale, zoomPercent } from "../../cad/viewport/viewport";
import { selectedSolarStats } from "../../store/useCadStore";
import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { calculateAllPeriods, calculateSystemCostEstimate, filterPanelsOnRoofs } from "../../cad/energy/energyCalculator";

interface Props {
  stageRef: RefObject<Konva.Stage>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onShowProjects: () => void;
}

export function TopBar({ stageRef, viewMode, setViewMode, onShowProjects }: Props) {
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const document = useCadStore((state) => state.document);
  const viewport = useCadStore((state) => state.viewport);
  const setViewport = useCadStore((state) => state.setViewport);
  const setProjectName = useCadStore((state) => state.setProjectName);
  const undo = useCadStore((state) => state.undo);
  const redo = useCadStore((state) => state.redo);
  const clearSelection = useCadStore((state) => state.clearSelection);
  const stats = selectedSolarStats(document.objects, document.objects.filter((object) => object.type === "solarPanel").map((object) => object.id));
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
      const image = captureDrawingDataUrl(stageRef.current);
      if (!image) return;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
      const panels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
      const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
      const installedPanels = filterPanelsOnRoofs(panels, roofs);
      const energy = calculateAllPeriods({
        panels,
        roofs,
        averageRadiance: 800,
        temperatureCorrectionFactor: 0.95,
        sunlightHours: 6,
        electricityRate: 0.12
      });
      const month = energy.month;
      const year = energy.year;
      const costEstimate = calculateSystemCostEstimate(year.totalCapacity, year.estimatedRevenue);
      const drawingBox = fitImageRect(
        stageRef.current?.width() ?? 1,
        stageRef.current?.height() ?? 1,
        18,
        39,
        276,
        224
      );

      pdf.setFillColor(247, 249, 250);
      pdf.rect(0, 0, 420, 297, "F");
      pdf.setFillColor(255, 255, 255);
      pdf.rect(12, 12, 288, 273, "F");
      pdf.rect(306, 12, 102, 273, "F");

      pdf.setFontSize(18);
      pdf.text(document.name, 18, 24);
      pdf.setFontSize(9);
      pdf.setTextColor(90, 103, 116);
      pdf.text(`RufsunCAD export | ${new Date().toLocaleDateString()}`, 18, 31);
      pdf.addImage(image, "PNG", drawingBox.x, drawingBox.y, drawingBox.width, drawingBox.height);
      pdf.setTextColor(31, 41, 55);
      pdf.setFontSize(9);
      pdf.text(`Visible CAD drawing. Editor-only grid, guides, and handles are hidden from export.`, 18, 268);

      pdf.setTextColor(22, 133, 95);
      pdf.setFontSize(14);
      pdf.text("Analysis", 314, 25);
      pdf.setTextColor(31, 41, 55);
      pdf.setFontSize(8.5);
      pdf.text("System Overview", 314, 38);
      drawPdfMetric(pdf, 314, 47, "Total modules", String(panels.length));
      drawPdfMetric(pdf, 314, 55, "Panels inside roof", String(installedPanels.length));
      drawPdfMetric(pdf, 314, 63, "DC capacity", `${stats.totalKwp.toFixed(2)} kWp`);
      drawPdfMetric(pdf, 314, 71, "Roof count", String(roofs.length));
      drawPdfMetric(pdf, 314, 79, "Performance ratio", `${month.performanceRatio}%`);
      drawPdfMetric(pdf, 314, 87, "System efficiency", `${month.efficiency}%`);

      pdf.setFontSize(8.5);
      pdf.text("Energy Output", 314, 103);
      drawPdfMetric(pdf, 314, 112, "Today", `${energy.today.totalEnergyKwh} kWh`);
      drawPdfMetric(pdf, 314, 120, "Week", `${energy.week.totalEnergyKwh} kWh`);
      drawPdfMetric(pdf, 314, 128, "Month", `${month.totalEnergyKwh} kWh`);
      drawPdfMetric(pdf, 314, 136, "Year", `${year.totalEnergyKwh} kWh`);
      drawPdfMetric(pdf, 314, 144, "Daily average", `${month.averageDailyGeneration} kWh`);
      drawPdfMetric(pdf, 314, 152, "Peak generation", `${month.peakGeneration} kW`);

      pdf.setFontSize(8.5);
      pdf.text("Financial Estimate", 314, 168);
      drawPdfMetric(pdf, 314, 177, "System cost", formatCurrency(costEstimate.systemCost));
      drawPdfMetric(pdf, 314, 185, "Monthly savings", formatCurrency(month.estimatedRevenue));
      drawPdfMetric(pdf, 314, 193, "Annual savings", formatCurrency(year.estimatedRevenue));
      drawPdfMetric(pdf, 314, 201, "Payback", costEstimate.paybackYears === null ? "N/A" : `${costEstimate.paybackYears} years`);

      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(7);
      pdf.text("Assumptions: 800 W/m2 irradiance,", 314, 250);
      pdf.text("6 h/day sunlight, $0.12/kWh rate,", 314, 257);
      pdf.text("95% temperature factor.", 314, 264);
      pdf.text("Only panels fully inside a roof count.", 314, 271);
      pdf.save(`${document.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
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

function drawPdfMetric(pdf: jsPDF, x: number, y: number, label: string, value: string) {
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(7);
  pdf.text(label, x, y);
  pdf.setTextColor(31, 41, 55);
  pdf.setFontSize(8);
  pdf.text(value, x + 84, y, { align: "right" });
}

function formatCurrency(value: number) {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString()}`;
}

function fitImageRect(sourceWidth: number, sourceHeight: number, x: number, y: number, maxWidth: number, maxHeight: number) {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const ratio = Math.min(maxWidth / safeWidth, maxHeight / safeHeight);
  const width = safeWidth * ratio;
  const height = safeHeight * ratio;
  return {
    x: x + (maxWidth - width) / 2,
    y: y + (maxHeight - height) / 2,
    width,
    height
  };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
