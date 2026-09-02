import type Konva from "konva";
import { ChevronDown, Download, FileDown, Home, Magnet, Save, Sun } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useCadStore } from "../../store/useCadStore";
import type { ProjectSolarDataState, SolarDebugLayerState } from "../../cad/solar/solarExposureTypes";
import { exportProjectReportPdf } from "../../reports/projectReport";
import { SolarExposurePanel } from "../panels/SolarExposurePanel";
import type { RoofObject } from "../../types/cad";
import type { CompanyCommercialSummary } from "../../api/types";

interface Props {
  stageRef: RefObject<Konva.Stage>;
  onShowProjects: () => void;
  cloudSaveStatus?: "idle" | "saving" | "saved" | "offline" | "error";
  solarExposure?: ProjectSolarDataState;
  onLoadSolarExposure?: () => void;
  onToggleSolarExposure?: (visible: boolean) => void;
  onUpdateSolarDebugLayers?: (patch: Partial<SolarDebugLayerState>) => void;
  onUpdateSolarRegistration?: (patch: Partial<NonNullable<ProjectSolarDataState["registration"]>>, calibrated?: boolean) => void;
  commercialAccess?: CompanyCommercialSummary | null;
}

export function TopBar({
  stageRef,
  onShowProjects,
  cloudSaveStatus = "idle",
  solarExposure,
  onLoadSolarExposure,
  onToggleSolarExposure,
  onUpdateSolarDebugLayers,
  onUpdateSolarRegistration,
  commercialAccess
}: Props) {
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const snapMenuRef = useRef<HTMLDivElement | null>(null);
  const solarMenuRef = useRef<HTMLDivElement | null>(null);
  const document = useCadStore((state) => state.document);
  const selectedIds = useCadStore((state) => state.selectedIds);
  const setDocument = useCadStore((state) => state.setDocument);
  const setProjectName = useCadStore((state) => state.setProjectName);
  const clearSelection = useCadStore((state) => state.clearSelection);
  const [projectNameDraft, setProjectNameDraft] = useState(document.name);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);
  const [solarMenuOpen, setSolarMenuOpen] = useState(false);
  const [, setDropdownLayoutTick] = useState(0);
  const selectedRoof = document.objects.find((object): object is RoofObject => object.type === "roof" && selectedIds.includes(object.id));
  const canLoadSolar = hasEntitlement(commercialAccess, "solar.irradiance");
  const canExportAdvancedReport = hasEntitlement(commercialAccess, "reports.advanced");

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
    if (!exportMenuOpen && !snapMenuOpen && !solarMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportMenuOpen(false);
      if (!snapMenuRef.current?.contains(event.target as Node)) setSnapMenuOpen(false);
      if (!solarMenuRef.current?.contains(event.target as Node)) setSolarMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [exportMenuOpen, snapMenuOpen, solarMenuOpen]);

  useEffect(() => {
    if (!exportMenuOpen && !snapMenuOpen && !solarMenuOpen) return;
    const updateDropdownLayout = () => setDropdownLayoutTick((tick) => tick + 1);
    window.addEventListener("resize", updateDropdownLayout);
    window.addEventListener("scroll", updateDropdownLayout, true);
    return () => {
      window.removeEventListener("resize", updateDropdownLayout);
      window.removeEventListener("scroll", updateDropdownLayout, true);
    };
  }, [exportMenuOpen, snapMenuOpen, solarMenuOpen]);

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
    if (!canExportAdvancedReport) {
      window.alert("Your company does not have access to advanced reports.");
      return;
    }
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
      <div className="topbar-spacer" />
      <span className={`cloud-save-pill ${cloudSaveStatus}`}>
        {cloudSaveLabel(cloudSaveStatus)}
      </span>
      <div className="topbar-spacer" />
      <div className="command-cluster">
        <nav className="menu-strip header-dropdowns" aria-label="Project commands">
          {solarExposure && onLoadSolarExposure && onToggleSolarExposure && onUpdateSolarDebugLayers && onUpdateSolarRegistration && (
            <div className="export-menu" ref={solarMenuRef}>
              <button
                className="export-trigger icon-trigger"
                onClick={() => setSolarMenuOpen((open) => !open)}
                title="Solar Exposure"
                aria-label="Solar exposure settings"
                aria-haspopup="menu"
                aria-expanded={solarMenuOpen}
              >
                <Sun /> <ChevronDown />
              </button>
              {solarMenuOpen && (
                <div className="export-dropdown solar-settings-dropdown" role="menu" style={dropdownStyle(solarMenuRef, 360)}>
                  <SolarExposurePanel
                    roof={selectedRoof}
                    solarExposure={solarExposure}
                    onLoad={() => {
                      if (!canLoadSolar) {
                        window.alert("Your company does not have access to Solar Irradiance.");
                        return;
                      }
                      onLoadSolarExposure();
                    }}
                    onToggleVisible={onToggleSolarExposure}
                    onUpdateDebugLayers={onUpdateSolarDebugLayers}
                    onUpdateRegistration={onUpdateSolarRegistration}
                  />
                </div>
              )}
            </div>
          )}
          <div className="export-menu" ref={snapMenuRef}>
            <button
              className="export-trigger icon-trigger"
              onClick={() => setSnapMenuOpen((open) => !open)}
              title="Snapping"
              aria-label="Snapping settings"
              aria-haspopup="menu"
              aria-expanded={snapMenuOpen}
            >
              <Magnet /> <ChevronDown />
            </button>
            {snapMenuOpen && (
              <div className="export-dropdown settings-dropdown" role="menu" style={dropdownStyle(snapMenuRef, 260)}>
                <h3>Snapping</h3>
                {(["enabled", "grid", "endpoints", "midpoints", "centers", "edges", "alignment"] as const).map((key) => (
                  <Toggle
                    key={key}
                    label={key[0].toUpperCase() + key.slice(1)}
                    checked={document.settings.snap[key]}
                    onChange={(checked) => setDocument({ ...document, settings: { ...document.settings, snap: { ...document.settings.snap, [key]: checked } } })}
                  />
                ))}
                <NumberField
                  label="Tolerance"
                  value={document.settings.snap.tolerancePx}
                  suffix="px"
                  onCommit={(tolerancePx) => setDocument({ ...document, settings: { ...document.settings, snap: { ...document.settings.snap, tolerancePx: Math.max(1, tolerancePx) } } })}
                />
              </div>
            )}
          </div>
          <div className="export-menu" ref={exportMenuRef}>
            <button
              className="export-trigger icon-trigger"
              onClick={() => setExportMenuOpen((open) => !open)}
              title="Export"
              aria-label="Export"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
            >
              <Save /> <ChevronDown />
            </button>
            {exportMenuOpen && (
              <div className="export-dropdown" role="menu" style={dropdownStyle(exportMenuRef, 168)}>
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
        <button className="designer-projects-btn" onClick={onShowProjects} title="Back to Projects">
          <Home /> Back to Projects
        </button>
      </div>
    </header>
  );
}

function hasEntitlement(commercialAccess: CompanyCommercialSummary | null | undefined, key: string) {
  if (!commercialAccess) return true;
  return Boolean(commercialAccess.subscriptionValid && commercialAccess.entitlements[key]?.enabled);
}

function dropdownStyle(menuRef: RefObject<HTMLElement>, preferredWidth: number): CSSProperties {
  const margin = 8;
  const gap = 6;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(80, viewportWidth - margin * 2);
  const width = Math.min(preferredWidth, maxWidth);
  const rect = menuRef.current?.getBoundingClientRect();
  const anchorRight = rect?.right ?? viewportWidth - margin;
  const anchorBottom = rect?.bottom ?? margin;
  const left = clamp(anchorRight - width, margin, Math.max(margin, viewportWidth - width - margin));
  const top = Math.min(anchorBottom + gap, Math.max(margin, viewportHeight - 160));
  const maxHeight = Math.max(80, viewportHeight - top - margin);

  return {
    left,
    top,
    width,
    maxWidth: viewportWidth - margin * 2,
    maxHeight
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function NumberField({ label, value, suffix, onCommit }: { label: string; value: number; suffix?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(round(value)));
  };
  return (
    <label className="field number-field">
      <span>{label}</span>
      <div>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
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
