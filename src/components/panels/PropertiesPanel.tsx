import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Sliders, Trash2, CheckCircle2, Sparkles, Grid } from "lucide-react";
import { useCadStore, selectedSolarStats } from "../../store/useCadStore";
import type { CadObject, RoofEdgeClassification, RoofObject, SolarPanelObject, SubarrayConfig, SubarrayRackingType } from "../../types/cad";
import { BUILTIN_SOLAR_MODULES, getAllSolarModules, saveCustomModule, findModuleById, type SolarModuleItem, type CellTechnology } from "../../cad/catalog/moduleCatalog";
import { generatePvLayout, calculateRowPitch, calculateSubarrayStats, type AutoDesignerMode, type LayoutPrioritization } from "../../cad/layout/pvLayoutEngine";
import { buildSolarArray } from "../../cad/array/array";
import { formatMetric, polygonArea, distance, angle, validatePanelPlacement, roofUsablePolygon } from "../../cad/geometry/geometry";
import { nextZ } from "../../cad/objects/factory";
import type { CompanyCommercialSummary } from "../../api/types";
import { DEFAULT_STRUCTURE_ID, calculateSiteSummary, ensureSiteModel, normalizeRoofEdges } from "../../cad/site/siteModel";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";

export function PropertiesPanel({
  commercialAccess,
  solarExposure
}: {
  commercialAccess?: CompanyCommercialSummary | null;
  solarExposure?: ProjectSolarDataState;
}) {
  const document = useCadStore((state) => state.document);
  const selectedIds = useCadStore((state) => state.selectedIds);
  const activeTool = useCadStore((state) => state.activeTool);
  const updateObject = useCadStore((state) => state.updateObject);
  const addObjects = useCadStore((state) => state.addObjects);
  const setLayer = useCadStore((state) => state.setLayer);
  const setActiveLayer = useCadStore((state) => state.setActiveLayer);
  const selectedObjects = document.objects.filter((object) => selectedIds.includes(object.id));

  return (
    <aside className="properties-panel">
      {selectedObjects.length === 0 ? (
        <DocumentSummary />
      ) : selectedObjects.length === 1 ? (
        <SingleObject
          object={selectedObjects[0]}
          updateObject={updateObject}
          addObjects={addObjects}
        />
      ) : (
        <MultiSelection objects={selectedObjects} />
      )}

      {activeTool === "solar" && (
        <SolarLayoutTools
          canAutoFill={hasEntitlement(commercialAccess, "layout.auto_fill")}
          solarExposure={solarExposure}
        />
      )}

      <SubarraysSection />

      <section className="panel-section">
        <h2>Layers</h2>
        <div className="layer-list">
          {document.layers.map((layer) => (
            <div key={layer.id} className={`layer-row ${document.settings.activeLayerId === layer.id ? "active" : ""}`}>
              <button title={layer.visible ? "Hide layer" : "Show layer"} onClick={() => setLayer(layer.id, { visible: !layer.visible })}>
                {layer.visible ? <Eye /> : <EyeOff />}
              </button>
              <button title={layer.locked ? "Unlock layer" : "Lock layer"} onClick={() => setLayer(layer.id, { locked: !layer.locked })}>
                {layer.locked ? <Lock /> : <Unlock />}
              </button>
              <button className="layer-name" onClick={() => setActiveLayer(layer.id)}>
                <span style={{ background: layer.color }} />
                {layer.name}
              </button>
            </div>
          ))}
        </div>
      </section>

    </aside>
  );
}

function DocumentSummary() {
  const document = useCadStore((state) => state.document);
  const selectOnly = useCadStore((state) => state.selectOnly);
  const setDocument = useCadStore((state) => state.setDocument);
  const normalized = ensureSiteModel(document);
  const siteSummary = calculateSiteSummary(document);
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const panels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const watts = panels.reduce((sum, panel) => sum + panel.wattage, 0);
  const roofArea = roofs.reduce((sum, roof) => sum + polygonArea(roof.points), 0) / 1_000_000;
  return (
    <section className="panel-section project-overview">
      <h2>Project</h2>
      <div className="project-title-card">
        <strong>{document.customerName || document.name}</strong>
        <span>{document.customerAddress || "No address added"}</span>
      </div>
      <div className="project-metric-grid">
        <MetricCard label="Modules" value={panels.length} />
        <MetricCard label="Capacity" value={`${(watts / 1000).toFixed(2)} kWp`} />
        <MetricCard label="Structures" value={siteSummary.structureCount} />
        <MetricCard label="Roof faces" value={siteSummary.roofFaceCount} />
        <MetricCard label="Usable area" value={`${siteSummary.usableRoofAreaM2.toFixed(1)} m2`} />
      </div>
      <Stat label="Project name" value={document.name} />
      <Stat label="Gross roof area" value={`${roofArea.toFixed(1)} m2`} />
      <NumberField
        label="North"
        value={normalized.site?.northRotation ?? 0}
        suffix="deg"
        onCommit={(northRotation) =>
          setDocument({
            ...normalized,
            site: {
              ...(normalized.site ?? { structures: [], northRotation: 0 }),
              northRotation
            }
          })
        }
      />
      <Stat label="Objects" value={document.objects.length} />
      <div className="site-navigator">
        <div className="site-navigator-header">
          <h3>Site</h3>
          <button type="button" onClick={() => addStructure(normalized, setDocument)}>
            + Structure
          </button>
        </div>
        {normalized.site?.structures.map((structure) => (
          <div key={structure.id} className="site-structure-row">
            <strong>{structure.name}</strong>
            {structure.roofFaceIds.map((roofId) => {
              const roof = roofs.find((item) => item.id === roofId);
              if (!roof) return null;
              return (
                <button key={roofId} type="button" onClick={() => selectOnly(roofId)}>
                  {roof.name || "Roof Face"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function addStructure(document: ReturnType<typeof ensureSiteModel>, setDocument: (document: ReturnType<typeof ensureSiteModel>, recordHistory?: boolean) => void) {
  const name = window.prompt("Structure name", `Structure ${(document.site?.structures.length ?? 0) + 1}`);
  if (!name?.trim()) return;
  setDocument({
    ...document,
    site: {
      ...(document.site ?? { northRotation: 0, structures: [] }),
      structures: [
        ...(document.site?.structures ?? []),
        { id: `structure-${Date.now()}`, name: name.trim(), buildingType: "other", roofFaceIds: [] }
      ]
    }
  });
}

function SolarLayoutTools({
  canAutoFill,
  solarExposure
}: {
  canAutoFill: boolean;
  solarExposure?: ProjectSolarDataState;
}) {
  const document = useCadStore((state) => state.document);
  const selectedModuleId = useCadStore((state) => state.selectedModuleId);
  const setSelectedModuleId = useCadStore((state) => state.setSelectedModuleId);
  const addObjects = useCadStore((state) => state.addObjects);
  const showToast = useCadStore((state) => state.showToast);
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const obstructions = document.objects.filter((object) => object.type === "obstruction");
  const restrictedZones = document.objects.filter((object) => object.type === "restrictedZone");

  const [tab, setTab] = useState<"autodesigner" | "manual">("autodesigner");
  const [designerMode, setDesignerMode] = useState<AutoDesignerMode>("max_fill");
  const [targetKwp, setTargetKwp] = useState(10);
  const [targetCount, setTargetCount] = useState(18);
  const [prioritization, setPrioritization] = useState<LayoutPrioritization>("standard_grid");
  const [orientation, setOrientation] = useState<SolarPanelObject["orientation"]>("portrait");
  const [gap, setGap] = useState(20);

  // Walkway corridor
  const [hasWalkway, setHasWalkway] = useState(false);
  const [walkwayWidthMm, setWalkwayWidthMm] = useState(900);
  const [walkwayOrientation, setWalkwayOrientation] = useState<"vertical" | "horizontal">("vertical");

  // Racking & pitch
  const [rackingType, setRackingType] = useState<SubarrayRackingType>("flush");
  const [rackTiltDeg, setRackTiltDeg] = useState(15);

  // Subarray name & custom module modal
  const [subarrayName, setSubarrayName] = useState("");
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [allModules, setAllModules] = useState<SolarModuleItem[]>(getAllSolarModules());

  // Manual grid inputs
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(6);

  const [selectedRoofId, setSelectedRoofId] = useState<string>("");

  const module = allModules.find((item) => item.id === selectedModuleId) ?? allModules[0] ?? BUILTIN_SOLAR_MODULES[0];

  const largestRoof = roofs
    .slice()
    .sort((a, b) => polygonArea(b.points) - polygonArea(a.points))[0];

  const activeRoof = roofs.find((r) => r.id === selectedRoofId) ?? largestRoof;

  const prevRoofCount = useRef(roofs.length);
  useEffect(() => {
    if (roofs.length === 0) {
      setSelectedRoofId("");
    } else if (roofs.length > prevRoofCount.current) {
      setSelectedRoofId(roofs[roofs.length - 1].id);
    } else if (!roofs.some((r) => r.id === selectedRoofId)) {
      setSelectedRoofId(roofs[roofs.length - 1].id);
    }
    prevRoofCount.current = roofs.length;
  }, [roofs, selectedRoofId]);

  // Calculated row pitch preview for tilted racks
  const modHeight = orientation === "portrait" ? module.heightMM : module.widthMM;
  const calculatedPitch = calculateRowPitch(modHeight, rackTiltDeg);

  const handleGenerateAutoLayout = () => {
    if (!activeRoof) return;
    if (designerMode === "max_fill" && !canAutoFill) {
      showToast("Your company does not have access to Auto Fill.");
      return;
    }

    const existingPanels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
    const layerId = preferredSolarLayer(document);
    const zIndexStart = nextZ(document.objects);

    const effectiveSubarrayName =
      subarrayName.trim() || `${activeRoof.name || "Roof"} ${rackingType === "tilted_rack" ? "Tilted " : ""}Array`;

    const result = generatePvLayout({
      roof: activeRoof,
      module,
      mode: designerMode,
      targetKwp: designerMode === "target_capacity" ? targetKwp : undefined,
      targetCount: designerMode === "target_count" ? targetCount : undefined,
      orientation,
      moduleGap: gap,
      walkwayWidthMm: hasWalkway ? walkwayWidthMm : 0,
      walkwayOrientation,
      prioritization,
      solarExposure,
      subarrayName: effectiveSubarrayName,
      rackingType,
      rackTiltDeg: rackingType === "tilted_rack" || rackingType === "ballasted" ? rackTiltDeg : undefined,
      layerId,
      zIndexStart,
      existingPanels,
      obstructions,
      restrictedZones,
      clearanceMm: 25.4
    });

    if (result.panels.length > 0) {
      addObjects(result.panels, result.panels.map((p) => p.id), result.subarray);
      setSelectedRoofId(activeRoof.id);

      const targetMsg =
        designerMode === "target_capacity"
          ? ` · Target: ${targetKwp} kWp`
          : designerMode === "target_count"
          ? ` · Target: ${targetCount} panels`
          : "";
      showToast(
        `AutoDesigner placed ${result.panels.length} panels (${result.totalCapacityKwp} kWp)${targetMsg}${
          result.skippedCount > 0 ? ` · ${result.skippedCount} positions skipped` : ""
        }`
      );
    } else {
      showToast("No suitable positions found inside usable roof area.");
    }
  };

  const handleManualGrid = () => {
    if (!activeRoof) return;
    const existingPanels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
    const layerId = preferredSolarLayer(document);
    const zIndexStart = nextZ(document.objects);

    const effectiveSubarrayName = subarrayName.trim() || `${activeRoof.name || "Roof"} Grid Array`;

    const result = generatePvLayout({
      roof: activeRoof,
      module,
      mode: "target_count",
      targetCount: rows * columns,
      orientation,
      moduleGap: gap,
      rowPitchMm: rackingType === "tilted_rack" ? calculatedPitch : undefined,
      subarrayName: effectiveSubarrayName,
      rackingType,
      rackTiltDeg: rackingType === "tilted_rack" ? rackTiltDeg : undefined,
      layerId,
      zIndexStart,
      existingPanels,
      obstructions,
      restrictedZones,
      clearanceMm: 25.4
    });

    if (result.panels.length > 0) {
      addObjects(result.panels, result.panels.map((p) => p.id), result.subarray);
      setSelectedRoofId(activeRoof.id);
      showToast(`Grid placed ${result.panels.length} panels (${result.totalCapacityKwp} kWp)`);
    } else {
      showToast("No space available — grid positions overlap boundaries or obstructions");
    }
  };

  return (
    <section className="panel-section solar-layout-tools">
      <div className="panel-heading-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>PV Layout Engine</h2>
        <button
          className="ghost-button"
          style={{ fontSize: "11px", padding: "2px 8px" }}
          onClick={() => setCustomModalOpen(true)}
          title="Add custom solar module specifications"
        >
          + Custom Module
        </button>
      </div>

      {roofs.length > 0 && (
        <label className="field">
          <span>Target Roof</span>
          <select value={activeRoof?.id ?? ""} onChange={(event) => setSelectedRoofId(event.target.value)}>
            {roofs.map((roof, index) => (
              <option key={roof.id} value={roof.id}>
                {roof.name || `Roof ${index + 1}`} ({(polygonArea(roof.points) / 1_000_000).toFixed(1)} m²)
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Solar Module</span>
        <select
          value={selectedModuleId}
          onChange={(event) => setSelectedModuleId(event.target.value)}
        >
          {allModules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.manufacturer} {item.model} · {item.wattage}W ({item.widthMM}×{item.heightMM})
              {item.isCustom ? " ★" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Mode Switcher Tabs */}
      <div className="control-tabs" style={{ display: "flex", margin: "8px 0", gap: "4px" }}>
        <button
          type="button"
          className={tab === "autodesigner" ? "active" : ""}
          onClick={() => setTab("autodesigner")}
          style={{ flex: 1, padding: "6px", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
        >
          <Sparkles size={13} /> AutoDesigner
        </button>
        <button
          type="button"
          className={tab === "manual" ? "active" : ""}
          onClick={() => setTab("manual")}
          style={{ flex: 1, padding: "6px", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
        >
          <Grid size={13} /> Manual Grid
        </button>
      </div>

      {tab === "autodesigner" ? (
        <>
          <label className="field">
            <span>Sizing Goal</span>
            <select
              value={designerMode}
              onChange={(e) => setDesignerMode(e.target.value as AutoDesignerMode)}
            >
              <option value="max_fill">Max Fill (Maximum Density)</option>
              <option value="target_capacity">Target Capacity (kWp)</option>
              <option value="target_count">Target Module Count</option>
            </select>
          </label>

          {designerMode === "target_capacity" && (
            <div>
              <NumberField
                label="Target Capacity"
                value={targetKwp}
                suffix="kWp"
                onCommit={(val) => setTargetKwp(Math.max(0.5, val))}
              />
              <p className="fine-print" style={{ marginTop: "-4px", marginBottom: "8px" }}>
                Requires ~{Math.ceil((targetKwp * 1000) / module.wattage)} modules ({module.wattage}W each)
              </p>
            </div>
          )}

          {designerMode === "target_count" && (
            <div>
              <NumberField
                label="Module Count"
                value={targetCount}
                suffix="panels"
                onCommit={(val) => setTargetCount(Math.max(1, Math.round(val)))}
              />
              <p className="fine-print" style={{ marginTop: "-4px", marginBottom: "8px" }}>
                Total system size: {((targetCount * module.wattage) / 1000).toFixed(2)} kWp
              </p>
            </div>
          )}

          {solarExposure?.status === "ready" && (
            <label className="field">
              <span>Placement Priority</span>
              <select
                value={prioritization}
                onChange={(e) => setPrioritization(e.target.value as LayoutPrioritization)}
              >
                <option value="best_irradiance">Best Solar Exposure (Highest Flux First)</option>
                <option value="standard_grid">Standard Grid (Top to Bottom)</option>
              </select>
            </label>
          )}

          <div className="layout-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <label className="field">
              <span>Orientation</span>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as SolarPanelObject["orientation"])}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <NumberField
              label="Module Gap"
              value={gap}
              suffix="mm"
              onCommit={(val) => setGap(Math.max(0, val))}
            />
          </div>

          {/* Racking Type Selection */}
          <label className="field">
            <span>Racking System</span>
            <select
              value={rackingType}
              onChange={(e) => setRackingType(e.target.value as SubarrayRackingType)}
            >
              <option value="flush">Flush Mount (Roof Sloped)</option>
              <option value="tilted_rack">Tilted Rack (Flat Roof)</option>
              <option value="ballasted">Ballasted (Flat Commercial)</option>
              <option value="ground_mount">Ground Mount</option>
            </select>
          </label>

          {(rackingType === "tilted_rack" || rackingType === "ballasted") && (
            <div style={{ background: "rgba(22, 133, 95, 0.06)", padding: "8px", borderRadius: "6px", marginBottom: "8px" }}>
              <NumberField
                label="Rack Tilt"
                value={rackTiltDeg}
                suffix="deg"
                onCommit={(val) => setRackTiltDeg(Math.max(5, Math.min(60, val)))}
              />
              <p className="fine-print" style={{ margin: "4px 0 0" }}>
                Auto Row Pitch: <strong>{calculatedPitch} mm</strong> (avoids shading at 22° winter sun)
              </p>
            </div>
          )}

          {/* Service Walkway Corridor */}
          <div style={{ margin: "6px 0 10px" }}>
            <label className="toggle-row" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={hasWalkway}
                onChange={(e) => setHasWalkway(e.target.checked)}
              />
              <span>Service / Fire Access Walkway</span>
            </label>
            {hasWalkway && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "6px" }}>
                <NumberField
                  label="Walkway Width"
                  value={walkwayWidthMm}
                  suffix="mm"
                  onCommit={(val) => setWalkwayWidthMm(Math.max(300, val))}
                />
                <label className="field">
                  <span>Aisle Direction</span>
                  <select
                    value={walkwayOrientation}
                    onChange={(e) => setWalkwayOrientation(e.target.value as "vertical" | "horizontal")}
                  >
                    <option value="vertical">Vertical Corridor</option>
                    <option value="horizontal">Horizontal Corridor</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <label className="field">
            <span>Subarray Name</span>
            <input
              value={subarrayName}
              placeholder={`${activeRoof?.name || "Roof"} Array`}
              onChange={(e) => setSubarrayName(e.target.value)}
            />
          </label>

          <button
            className="primary-action"
            onClick={handleGenerateAutoLayout}
            disabled={!activeRoof}
            style={{ marginTop: "8px", width: "100%" }}
          >
            <Sparkles size={14} /> Auto Design Layout
          </button>
        </>
      ) : (
        <>
          <div className="layout-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <NumberField
              label="Rows"
              value={rows}
              onCommit={(value) => setRows(Math.max(1, Math.round(value)))}
            />
            <NumberField
              label="Columns"
              value={columns}
              onCommit={(value) => setColumns(Math.max(1, Math.round(value)))}
            />
          </div>
          <div className="layout-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <NumberField
              label="Gap"
              value={gap}
              suffix="mm"
              onCommit={(value) => setGap(Math.max(0, value))}
            />
            <label className="field">
              <span>Orientation</span>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as SolarPanelObject["orientation"])}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Subarray Name</span>
            <input
              value={subarrayName}
              placeholder={`${activeRoof?.name || "Roof"} Grid Array`}
              onChange={(e) => setSubarrayName(e.target.value)}
            />
          </label>

          <button
            className="primary-action"
            onClick={handleManualGrid}
            disabled={!activeRoof}
            style={{ marginTop: "8px", width: "100%" }}
          >
            Create Grid Array ({rows * columns} panels)
          </button>
        </>
      )}

      {customModalOpen && (
        <CustomModuleDialog
          onCancel={() => setCustomModalOpen(false)}
          onSave={(newModule) => {
            saveCustomModule(newModule);
            const updated = getAllSolarModules();
            setAllModules(updated);
            setSelectedModuleId(newModule.id);
            setCustomModalOpen(false);
            showToast(`Custom module "${newModule.manufacturer} ${newModule.model}" added!`);
          }}
        />
      )}
    </section>
  );
}

function SubarraysSection() {
  const document = useCadStore((state) => state.document);
  const selectSubarray = useCadStore((state) => state.selectSubarray);
  const deleteSubarray = useCadStore((state) => state.deleteSubarray);
  const panels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
  const stats = calculateSubarrayStats(panels, document.subarrays);

  if (panels.length === 0 && (!document.subarrays || document.subarrays.length === 0)) {
    return null;
  }

  return (
    <section className="panel-section">
      <div className="panel-heading-row">
        <h2>Subarrays</h2>
        <Layers size={14} />
      </div>
      <div className="subarray-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {stats.map((sub) => (
          <div
            key={sub.subarrayId}
            style={{
              padding: "8px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.03)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "12px" }}>{sub.name}</strong>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#16855f" }}>
                {sub.totalKwp} kWp
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
              <span>{sub.moduleCount} modules</span>
              <span>{sub.rackingType ? sub.rackingType.replace("_", " ") : "flush"}</span>
            </div>
            <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
              <button
                type="button"
                className="secondary-action"
                style={{ flex: 1, padding: "3px 6px", fontSize: "10px" }}
                onClick={() => selectSubarray(sub.subarrayId)}
              >
                Select Array
              </button>
              <button
                type="button"
                className="ghost-button"
                style={{ padding: "3px 6px", fontSize: "10px", color: "#b42318" }}
                title="Delete this subarray"
                onClick={() => {
                  if (window.confirm(`Delete ${sub.name}? Click OK to delete panels too, or Cancel to keep panels.`)) {
                    deleteSubarray(sub.subarrayId, true);
                  }
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomModuleDialog({
  onCancel,
  onSave
}: {
  onCancel: () => void;
  onSave: (module: SolarModuleItem) => void;
}) {
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [wattage, setWattage] = useState("550");
  const [widthMM, setWidthMM] = useState("1134");
  const [heightMM, setHeightMM] = useState("2278");
  const [thicknessMM, setThicknessMM] = useState("35");
  const [cellType, setCellType] = useState<CellTechnology>("mono-perc");
  const [vOc, setVOc] = useState("49.8");
  const [iSc, setISc] = useState("13.98");
  const [vMp, setVMp] = useState("41.95");
  const [iMp, setIMp] = useState("13.12");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manufacturer.trim() || !model.trim()) return;
    const w = Number(wattage);
    const width = Number(widthMM);
    const height = Number(heightMM);
    const thick = Number(thicknessMM);
    if (!w || !width || !height) return;

    onSave({
      id: `custom-${Date.now()}`,
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      wattage: w,
      widthMM: width,
      heightMM: height,
      thicknessMM: thick || 35,
      cellType,
      vOc: Number(vOc) || undefined,
      iSc: Number(iSc) || undefined,
      vMp: Number(vMp) || undefined,
      iMp: Number(iMp) || undefined
    });
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <form className="modal-card" onSubmit={handleSubmit} style={{ maxWidth: "440px", width: "95%" }}>
        <h2>Add Custom Solar Module</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <label className="field stacked">
            <span>Manufacturer</span>
            <input
              required
              autoFocus
              placeholder="e.g. SunPower"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
          </label>
          <label className="field stacked">
            <span>Model Name</span>
            <input
              required
              placeholder="e.g. Maxeon 6"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <label className="field stacked">
            <span>Power (W)</span>
            <input
              type="number"
              required
              value={wattage}
              onChange={(e) => setWattage(e.target.value)}
            />
          </label>
          <label className="field stacked">
            <span>Width (mm)</span>
            <input
              type="number"
              required
              value={widthMM}
              onChange={(e) => setWidthMM(e.target.value)}
            />
          </label>
          <label className="field stacked">
            <span>Height (mm)</span>
            <input
              type="number"
              required
              value={heightMM}
              onChange={(e) => setHeightMM(e.target.value)}
            />
          </label>
        </div>
        <label className="field stacked">
          <span>Cell Technology</span>
          <select value={cellType} onChange={(e) => setCellType(e.target.value as CellTechnology)}>
            <option value="mono-perc">Monocrystalline PERC</option>
            <option value="topcon">N-type TOPCon</option>
            <option value="bifacial">Bifacial Dual-Glass</option>
            <option value="hjt">Heterojunction (HJT)</option>
            <option value="polycrystalline">Polycrystalline</option>
            <option value="thin-film">Thin Film</option>
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <label className="field stacked">
            <span>Voc (V)</span>
            <input value={vOc} onChange={(e) => setVOc(e.target.value)} placeholder="Open Circuit" />
          </label>
          <label className="field stacked">
            <span>Isc (A)</span>
            <input value={iSc} onChange={(e) => setISc(e.target.value)} placeholder="Short Circuit" />
          </label>
        </div>
        <div className="modal-actions" style={{ marginTop: "12px" }}>
          <button type="button" className="secondary-action" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-action">
            Save & Use Module
          </button>
        </div>
      </form>
    </div>
  );
}

function SingleObject({
  object,
  updateObject,
  addObjects
}: {
  object: CadObject;
  updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void;
  addObjects: (objects: CadObject[], selectIds?: string[]) => void;
}) {
  const document = useCadStore((state) => state.document);
  return (
    <section className="panel-section">
      <h2>{labelFor(object)}</h2>
      <NumberField label="X" value={object.x} suffix="mm" onCommit={(x) => updateObject(object.id, { x } as Partial<CadObject>)} />
      <NumberField label="Y" value={object.y} suffix="mm" onCommit={(y) => updateObject(object.id, { y } as Partial<CadObject>)} />
      {object.type === "solarPanel" ? (
        <Stat label="Roof azimuth" value={`${object.rotation} deg`} />
      ) : (
        <NumberField label="Rotation" value={object.rotation} suffix="deg" onCommit={(rotation) => updateObject(object.id, { rotation } as Partial<CadObject>)} />
      )}
      <Toggle label="Locked" checked={object.locked} onChange={(locked) => updateObject(object.id, { locked } as Partial<CadObject>)} />
      <Toggle label="Visible" checked={object.visible} onChange={(visible) => updateObject(object.id, { visible } as Partial<CadObject>)} />
      <label className="field">
        <span>Layer</span>
        <select value={object.layerId} onChange={(event) => updateObject(object.id, { layerId: event.target.value } as Partial<CadObject>)}>
          {document.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
      </label>
      {object.type === "solarPanel" && <SolarProperties object={object} updateObject={updateObject} addObjects={addObjects} />}
      {object.type === "mapImage" && <MapImageProperties object={object} updateObject={updateObject} />}
      {object.type === "rectangle" && (
        <>
          <NumberField label="Width" value={object.width} suffix="mm" onCommit={(width) => updateObject(object.id, { width: Math.max(20, width) } as Partial<CadObject>)} />
          <NumberField label="Height" value={object.height} suffix="mm" onCommit={(height) => updateObject(object.id, { height: Math.max(20, height) } as Partial<CadObject>)} />
        </>
      )}
      {object.type === "circle" && <NumberField label="Radius" value={object.radius} suffix="mm" onCommit={(radius) => updateObject(object.id, { radius: Math.max(20, radius) } as Partial<CadObject>)} />}
      {object.type === "line" && (
        <>
          <Stat label="Length" value={formatMetric(distance({ x: object.x, y: object.y }, { x: object.x2, y: object.y2 }))} />
          <Stat label="Angle" value={`${angle({ x: object.x, y: object.y }, { x: object.x2, y: object.y2 }).toFixed(1)} deg`} />
          <NumberField label="X2" value={object.x2} suffix="mm" onCommit={(x2) => updateObject(object.id, { x2 } as Partial<CadObject>)} />
          <NumberField label="Y2" value={object.y2} suffix="mm" onCommit={(y2) => updateObject(object.id, { y2 } as Partial<CadObject>)} />
        </>
      )}
      {object.type === "roof" && <RoofProperties object={object} updateObject={updateObject} />}
      {object.type === "text" && (
        <>
          <label className="field">
            <span>Text</span>
            <input value={object.text} onChange={(event) => updateObject(object.id, { text: event.target.value } as Partial<CadObject>)} />
          </label>
          <NumberField label="Font" value={object.fontSize} suffix="mm" onCommit={(fontSize) => updateObject(object.id, { fontSize } as Partial<CadObject>)} />
        </>
      )}
      {object.type === "dimension" && <Stat label="Distance" value={formatMetric(distance(object.start, object.end))} />}
    </section>
  );
}

function SolarProperties({
  object,
  updateObject,
  addObjects
}: {
  object: SolarPanelObject;
  updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void;
  addObjects: (objects: CadObject[], selectIds?: string[]) => void;
}) {
  const [rows, setRows] = useState(4);
  const [columns, setColumns] = useState(8);
  const [horizontalGap, setHorizontalGap] = useState(object.moduleGap);
  const [verticalGap, setVerticalGap] = useState(object.moduleGap);
  const [orientation, setOrientation] = useState(object.orientation);

  const document = useCadStore((state) => state.document);
  const selectSubarray = useCadStore((state) => state.selectSubarray);

  const makeArray = () => {
    const panels = buildSolarArray(object, { rows, columns, horizontalGap, verticalGap, orientation });
    const newPanels = panels.slice(1).map((p) => ({
      ...p,
      subarrayId: object.subarrayId,
      rackingType: object.rackingType,
      rackTiltDeg: object.rackTiltDeg
    }));
    const currentDocument = useCadStore.getState().document;
    const roofs = currentDocument.objects.filter((o): o is RoofObject => o.type === "roof");
    const existingPanels = currentDocument.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
    const obstructions = currentDocument.objects.filter((o) => o.type === "obstruction");
    const restrictedZones = currentDocument.objects.filter((o) => o.type === "restrictedZone");
    const filtered = newPanels.filter((panel) =>
      validatePanelPlacement(panel, { roofs, existingPanels, obstructions, restrictedZones, clearanceMm: 25.4 }).valid
    );
    if (filtered.length) {
      addObjects(filtered, [object.id, ...filtered.map((panel) => panel.id)]);
      if (filtered.length < newPanels.length) {
        useCadStore.getState().showToast(`${filtered.length} panels added — ${newPanels.length - filtered.length} skipped (occupied)`);
      }
    } else {
      useCadStore.getState().showToast("No space available — all positions overlap existing panels");
    }
  };

  return (
    <>
      <Stat label="Manufacturer" value={object.manufacturer} />
      <Stat label="Model" value={object.model} />
      <Stat label="Width" value={`${object.width} mm`} />
      <Stat label="Height" value={`${object.height} mm`} />
      <NumberField label="Power" value={object.wattage} suffix="W" onCommit={(wattage) => updateObject(object.id, { wattage: Math.max(1, wattage) } as Partial<CadObject>)} />
      <NumberField label="Module Gap" value={object.moduleGap} suffix="mm" onCommit={(moduleGap) => updateObject(object.id, { moduleGap: Math.max(0, moduleGap) } as Partial<CadObject>)} />
      <label className="field">
        <span>Orientation</span>
        <select
          value={object.orientation}
          onChange={(event) => {
            const next = event.target.value as SolarPanelObject["orientation"];
            updateObject(object.id, {
              orientation: next,
              width: object.height,
              height: object.width
            } as Partial<CadObject>);
          }}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>

      {/* Subarray Assignment */}
      <label className="field">
        <span>Subarray</span>
        <select
          value={object.subarrayId ?? ""}
          onChange={(event) => {
            const nextSubId = event.target.value || undefined;
            updateObject(object.id, { subarrayId: nextSubId } as Partial<CadObject>);
          }}
        >
          <option value="">Unassigned</option>
          {(document.subarrays ?? []).map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
      </label>

      {object.subarrayId && (
        <button
          type="button"
          className="secondary-action"
          style={{ width: "100%", padding: "4px 8px", fontSize: "11px", marginBottom: "8px" }}
          onClick={() => selectSubarray(object.subarrayId!)}
        >
          Select All in Subarray
        </button>
      )}

      {/* Racking Type */}
      <label className="field">
        <span>Racking</span>
        <select
          value={object.rackingType ?? "flush"}
          onChange={(event) =>
            updateObject(object.id, { rackingType: event.target.value as SubarrayRackingType } as Partial<CadObject>)
          }
        >
          <option value="flush">Flush Mount</option>
          <option value="tilted_rack">Tilted Rack</option>
          <option value="ballasted">Ballasted</option>
          <option value="ground_mount">Ground Mount</option>
        </select>
      </label>

      {(object.rackingType === "tilted_rack" || object.rackingType === "ballasted") && (
        <NumberField
          label="Rack Tilt"
          value={object.rackTiltDeg ?? 15}
          suffix="deg"
          onCommit={(rackTiltDeg) =>
            updateObject(object.id, { rackTiltDeg: Math.max(0, Math.min(60, rackTiltDeg)) } as Partial<CadObject>)
          }
        />
      )}

      {object.warning && <p className="warning">{object.warning}</p>}
      <div className="array-box">
        <h3>Array Generator</h3>
        <NumberField label="Rows" value={rows} onCommit={(value) => setRows(Math.max(1, Math.round(value)))} />
        <NumberField label="Columns" value={columns} onCommit={(value) => setColumns(Math.max(1, Math.round(value)))} />
        <NumberField label="Horizontal gap" value={horizontalGap} suffix="mm" onCommit={setHorizontalGap} />
        <NumberField label="Vertical gap" value={verticalGap} suffix="mm" onCommit={setVerticalGap} />
        <label className="field">
          <span>Orientation</span>
          <select value={orientation} onChange={(event) => setOrientation(event.target.value as SolarPanelObject["orientation"])}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <button className="primary-action" onClick={makeArray}>Create Array</button>
      </div>
    </>
  );
}

function RoofProperties({ object, updateObject }: { object: RoofObject; updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void }) {
  const document = useCadStore((state) => state.document);
  const structures = ensureSiteModel(document).site?.structures ?? [];
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState(0);
  const area = polygonArea(object.points) / 1_000_000;
  const usableArea = polygonArea(roofUsablePolygon(object)) / 1_000_000;
  const edgeMetadata = normalizeRoofEdges(object);
  const selectedEdge = edgeMetadata[Math.min(selectedEdgeIndex, Math.max(0, edgeMetadata.length - 1))];
  const updateEdge = (patch: Partial<typeof selectedEdge>) => {
    const nextEdges = edgeMetadata.map((edge) => (edge.index === selectedEdge.index ? { ...edge, ...patch } : edge));
    updateObject(object.id, { edgeMetadata: nextEdges } as Partial<CadObject>);
  };

  return (
    <>
      <label className="field">
        <span>Name</span>
        <input value={object.name} onChange={(event) => updateObject(object.id, { name: event.target.value } as Partial<CadObject>)} />
      </label>
      <label className="field">
        <span>Structure</span>
        <select value={object.structureId ?? DEFAULT_STRUCTURE_ID} onChange={(event) => updateObject(object.id, { structureId: event.target.value } as Partial<CadObject>)}>
          {structures.map((structure) => (
            <option key={structure.id} value={structure.id}>
              {structure.name}
            </option>
          ))}
        </select>
      </label>
      <Stat label="Gross area" value={`${area.toFixed(1)} m2`} />
      <Stat label="Usable area" value={`${usableArea.toFixed(1)} m2`} />
      <NumberField label="Pitch" value={object.pitch ?? object.tilt} suffix="deg" onCommit={(pitch) => updateObject(object.id, { pitch, tilt: pitch } as Partial<CadObject>)} />
      <NumberField label="Azimuth" value={object.azimuth} suffix="deg" onCommit={(azimuth) => updateObject(object.id, { azimuth } as Partial<CadObject>)} />
      <NumberField label="Height" value={object.heightM} suffix="m" onCommit={(heightM) => updateObject(object.id, { heightM } as Partial<CadObject>)} />
      <NumberField label="Elevation" value={object.elevationM ?? 0} suffix="m" onCommit={(elevationM) => updateObject(object.id, { elevationM } as Partial<CadObject>)} />
      <NumberField label="Setback" value={object.setback} suffix="mm" onCommit={(setback) => updateObject(object.id, { setback: Math.max(0, setback) } as Partial<CadObject>)} />
      <label className="field">
        <span>Roof type</span>
        <select value={object.roofType ?? "pitched"} onChange={(event) => updateObject(object.id, { roofType: event.target.value } as Partial<CadObject>)}>
          <option value="flat">Flat</option>
          <option value="pitched">Pitched</option>
          <option value="shed">Shed</option>
          <option value="gable">Gable</option>
          <option value="hip">Hip</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="field">
        <span>Material</span>
        <select value={object.material ?? "shingle"} onChange={(event) => updateObject(object.id, { material: event.target.value } as Partial<CadObject>)}>
          <option value="metal">Metal</option>
          <option value="tile">Tile</option>
          <option value="shingle">Shingle</option>
          <option value="concrete">Concrete</option>
          <option value="other">Other</option>
        </select>
      </label>
      {selectedEdge && (
        <div className="edge-editor">
          <h3>Roof Edge</h3>
          <label className="field">
            <span>Edge</span>
            <select value={selectedEdge.index} onChange={(event) => setSelectedEdgeIndex(Number(event.target.value))}>
              {edgeMetadata.map((edge) => (
                <option key={edge.id} value={edge.index}>
                  Edge {edge.index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Class</span>
            <select value={selectedEdge.classification} onChange={(event) => updateEdge({ classification: event.target.value as RoofEdgeClassification })}>
              <option value="UNKNOWN">Unknown</option>
              <option value="EAVE">Eave</option>
              <option value="RIDGE">Ridge</option>
              <option value="HIP">Hip</option>
              <option value="VALLEY">Valley</option>
              <option value="RAKE">Rake</option>
            </select>
          </label>
          <NumberField label="Edge setback" value={selectedEdge.setback ?? object.setback} suffix="mm" onCommit={(setback) => updateEdge({ setback: Math.max(0, setback) })} />
        </div>
      )}
    </>
  );
}

function MultiSelection({ objects }: { objects: CadObject[] }) {
  const selectedIds = useCadStore((state) => state.selectedIds);
  const pushHistory = useCadStore((state) => state.pushHistory);
  const batchUpdateObjects = useCadStore((state) => state.batchUpdateObjects);
  const stats = selectedSolarStats(objects, selectedIds);
  const allPanels = objects.every((object) => object.type === "solarPanel");
  const panels = objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");

  function applyToAll(patches: { id: string; patch: Partial<CadObject> }[]) {
    pushHistory();
    batchUpdateObjects(patches, false);
  }

  function alignLeft() {
    const minX = Math.min(...panels.map((p) => p.x));
    applyToAll(panels.map((p) => ({ id: p.id, patch: { x: minX } })));
  }
  function alignRight() {
    const maxX = Math.max(...panels.map((p) => p.x + p.width));
    applyToAll(panels.map((p) => ({ id: p.id, patch: { x: maxX - p.width } })));
  }
  function alignCenterH() {
    const xs = panels.map((p) => p.x + p.width / 2);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    applyToAll(panels.map((p) => ({ id: p.id, patch: { x: cx - p.width / 2 } })));
  }
  function alignTop() {
    const minY = Math.min(...panels.map((p) => p.y));
    applyToAll(panels.map((p) => ({ id: p.id, patch: { y: minY } })));
  }
  function alignBottom() {
    const maxY = Math.max(...panels.map((p) => p.y + p.height));
    applyToAll(panels.map((p) => ({ id: p.id, patch: { y: maxY - p.height } })));
  }
  function alignCenterV() {
    const ys = panels.map((p) => p.y + p.height / 2);
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    applyToAll(panels.map((p) => ({ id: p.id, patch: { y: cy - p.height / 2 } })));
  }
  function distributeH() {
    if (panels.length < 3) return;
    const sorted = [...panels].sort((a, b) => a.x - b.x);
    const totalSpan = sorted[sorted.length - 1].x - sorted[0].x;
    const gap = totalSpan / (sorted.length - 1);
    applyToAll(sorted.map((p, i) => ({ id: p.id, patch: { x: sorted[0].x + gap * i } })));
  }
  function distributeV() {
    if (panels.length < 3) return;
    const sorted = [...panels].sort((a, b) => a.y - b.y);
    const totalSpan = sorted[sorted.length - 1].y - sorted[0].y;
    const gap = totalSpan / (sorted.length - 1);
    applyToAll(sorted.map((p, i) => ({ id: p.id, patch: { y: sorted[0].y + gap * i } })));
  }
  function rotatePanels(deltaDeg: number) {
    applyToAll(panels.map((p) => ({ id: p.id, patch: { rotation: ((p.rotation + deltaDeg) % 360 + 360) % 360 } })));
  }

  return (
    <section className="panel-section stats">
      <h2>Selected</h2>
      <Stat label="Objects" value={objects.length} />
      {allPanels && (
        <>
          <Stat label="Solar modules" value={stats.modules} />
          <Stat label="DC capacity" value={`${stats.totalKwp.toFixed(2)} kWp`} />
          <Stat label="Array width" value={formatMetric(stats.width)} />
          <Stat label="Array height" value={formatMetric(stats.height)} />
          {panels.length >= 2 && (
            <div className="align-tools">
              <p className="align-tools-label">Align</p>
              <div className="align-row">
                <button title="Align left edges" onClick={alignLeft}>⬛◻◻ Left</button>
                <button title="Align centers horizontally" onClick={alignCenterH}>◻⬛◻ CtrH</button>
                <button title="Align right edges" onClick={alignRight}>◻◻⬛ Right</button>
              </div>
              <div className="align-row">
                <button title="Align top edges" onClick={alignTop}>▀ Top</button>
                <button title="Align centers vertically" onClick={alignCenterV}>▬ CtrV</button>
                <button title="Align bottom edges" onClick={alignBottom}>▄ Bottom</button>
              </div>
              {panels.length >= 3 && (
                <div className="align-row">
                  <button title="Distribute horizontally with equal spacing" onClick={distributeH}>↔ Distrib H</button>
                  <button title="Distribute vertically with equal spacing" onClick={distributeV}>↕ Distrib V</button>
                </div>
              )}
              <p className="align-tools-label" style={{ marginTop: 6 }}>Rotate all</p>
              <div className="align-row">
                <button title="Rotate selection −15°" onClick={() => rotatePanels(-15)}>↺ −15°</button>
                <button title="Rotate selection +15°" onClick={() => rotatePanels(15)}>↻ +15°</button>
                <button title="Rotate selection +90°" onClick={() => rotatePanels(90)}>↻ +90°</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MapImageProperties({ object, updateObject }: { object: Extract<CadObject, { type: "mapImage" }>; updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void }) {
  return (
    <>
      <Stat label="Map width" value={`${(object.width / 1000).toFixed(1)} m`} />
      <Stat label="Map height" value={`${(object.height / 1000).toFixed(1)} m`} />
      <Stat label="Zoom" value={object.capture.zoom} />
      <NumberField label="Opacity" value={Math.round(object.opacity * 100)} suffix="%" onCommit={(opacity) => updateObject(object.id, { opacity: Math.max(0, Math.min(1, opacity / 100)) } as Partial<CadObject>)} />
      <p className="fine-print">Resize this map layer carefully; the current size is calibrated to real-world meters.</p>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function labelFor(object: CadObject) {
  const labels: Record<CadObject["type"], string> = {
    line: "Line",
    rectangle: "Rectangle",
    circle: "Circle",
    polygon: "Polygon",
    obstruction: "Obstruction",
    restrictedZone: "Restricted Zone",
    equipment: "Equipment",
    vegetation: "Vegetation",
    text: "Text",
    dimension: "Dimension",
    solarPanel: "Solar Module",
    mapImage: "Map Layer",
    roof: "Roof"
  };
  return labels[object.type];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function hasEntitlement(commercialAccess: CompanyCommercialSummary | null | undefined, key: string) {
  if (!commercialAccess) return true;
  return Boolean(commercialAccess.subscriptionValid && commercialAccess.entitlements[key]?.enabled);
}

function boundsFromPoints(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

function preferredSolarLayer(document: ReturnType<typeof useCadStore.getState>["document"]) {
  const solarLayer = document.layers.find((layer) => layer.id === "solar");
  if (solarLayer?.visible && !solarLayer.locked) return "solar";
  const activeLayer = document.layers.find((layer) => layer.id === document.settings.activeLayerId);
  if (activeLayer?.visible && !activeLayer.locked) return activeLayer.id;
  return document.layers.find((layer) => layer.visible && !layer.locked)?.id ?? "solar";
}
