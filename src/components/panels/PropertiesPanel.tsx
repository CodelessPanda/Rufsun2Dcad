import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useCadStore, selectedSolarStats } from "../../store/useCadStore";
import type { CadObject, RoofEdgeClassification, RoofObject, SolarPanelObject } from "../../types/cad";
import { sampleSolarModules } from "../../data/sampleSolarModules";
import { buildSolarArray } from "../../cad/array/array";
import { formatMetric, polygonArea, distance, angle, getBoundingBox, polygonContainsPolygon, roofUsablePolygon, rotatePoint, validatePanelPlacement } from "../../cad/geometry/geometry";
import { createSolarPanel, nextZ } from "../../cad/objects/factory";
import type { CompanyCommercialSummary } from "../../api/types";
import { DEFAULT_STRUCTURE_ID, calculateSiteSummary, ensureSiteModel, normalizeRoofEdges } from "../../cad/site/siteModel";

export function PropertiesPanel({ commercialAccess }: { commercialAccess?: CompanyCommercialSummary | null }) {
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

      {activeTool === "solar" && <SolarLayoutTools canAutoFill={hasEntitlement(commercialAccess, "layout.auto_fill")} />}

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

function SolarLayoutTools({ canAutoFill }: { canAutoFill: boolean }) {
  const document = useCadStore((state) => state.document);
  const selectedModuleId = useCadStore((state) => state.selectedModuleId);
  const setSelectedModuleId = useCadStore((state) => state.setSelectedModuleId);
  const addObjects = useCadStore((state) => state.addObjects);
  const showToast = useCadStore((state) => state.showToast);
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const obstructions = document.objects.filter((object) => object.type === "obstruction");
  const restrictedZones = document.objects.filter((object) => object.type === "restrictedZone");
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(6);
  const [gap, setGap] = useState(20);
  const [orientation, setOrientation] = useState<SolarPanelObject["orientation"]>("portrait");
  const [selectedRoofId, setSelectedRoofId] = useState<string>("");
  const module = sampleSolarModules.find((item) => item.id === selectedModuleId) ?? sampleSolarModules[0];

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

  const addGrid = () => {
    if (!activeRoof) return;
    const existingPanels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
    const { panels, skipped } = createPanelsForRoofGrid({
      roof: activeRoof,
      module,
      rows,
      columns,
      gap,
      orientation,
      zIndexStart: nextZ(document.objects),
      layerId: preferredSolarLayer(document),
      existingPanels,
      obstructions,
      restrictedZones
    });
    if (panels.length) {
      addObjects(panels, panels.map((panel) => panel.id));
      setSelectedRoofId(activeRoof.id);
      if (skipped > 0) showToast(`${panels.length} panels placed — ${skipped} positions skipped (occupied)`);
    } else {
      showToast("No space available — all positions overlap existing panels");
    }
  };

  const autoFill = () => {
    if (!canAutoFill) {
      showToast("Your company does not have access to Auto Fill.");
      return;
    }
    if (!activeRoof) return;
    const existingPanels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
    const layerId = preferredSolarLayer(document);
    const zIndex = nextZ(document.objects);
    const { panels, skipped } = createPanelsForRoofGrid({
      roof: activeRoof,
      module,
      rows: 99,
      columns: 99,
      gap,
      orientation,
      zIndexStart: zIndex,
      layerId,
      existingPanels,
      obstructions,
      restrictedZones
    });
    if (panels.length) {
      addObjects(panels, panels.map((panel) => panel.id));
      setSelectedRoofId(activeRoof.id);
      if (skipped > 0) showToast(`${panels.length} panels placed — ${skipped} positions skipped (occupied)`);
    } else {
      showToast("No space available — all positions overlap existing panels");
    }
  };

  return (
    <section className="panel-section solar-layout-tools">
      <h2>Solar Layout</h2>
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
      <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
        {sampleSolarModules.map((module) => (
          <option key={module.id} value={module.id}>
            {module.manufacturer} {module.model} · {module.wattage} W
          </option>
        ))}
      </select>
      <div className="layout-controls">
        <NumberField label="Rows" value={rows} onCommit={(value) => setRows(Math.max(1, Math.round(value)))} />
        <NumberField label="Columns" value={columns} onCommit={(value) => setColumns(Math.max(1, Math.round(value)))} />
        <NumberField label="Gap" value={gap} suffix="mm" onCommit={(value) => setGap(Math.max(0, value))} />
        <label className="field">
          <span>Orientation</span>
          <select value={orientation} onChange={(event) => setOrientation(event.target.value as SolarPanelObject["orientation"])}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      <div className="layout-actions">
        <button className="primary-action" onClick={addGrid} disabled={!activeRoof}>
          Create Grid
        </button>
        <button className="secondary-action" onClick={autoFill} disabled={!activeRoof || !canAutoFill}>
          Auto Fill Roof
        </button>
      </div>
      <p className="fine-print">
        {roofs.length === 0
          ? "Draw a roof first to place arrays automatically."
          : "Panels are only added where the full module footprint fits inside the selected roof."}
      </p>
    </section>
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

  const makeArray = () => {
    const panels = buildSolarArray(object, { rows, columns, horizontalGap, verticalGap, orientation });
    const newPanels = panels.slice(1);
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
  const stats = selectedSolarStats(objects, selectedIds);
  const allPanels = objects.every((object) => object.type === "solarPanel");
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

function createPanelsForRoofGrid({
  roof,
  module,
  rows,
  columns,
  gap,
  orientation,
  zIndexStart,
  layerId,
  existingPanels,
  obstructions,
  restrictedZones
}: {
  roof: RoofObject;
  module: (typeof sampleSolarModules)[number];
  rows: number;
  columns: number;
  gap: number;
  orientation: SolarPanelObject["orientation"];
  zIndexStart: number;
  layerId: string;
  existingPanels: SolarPanelObject[];
  obstructions: Extract<CadObject, { type: "obstruction" }>[];
  restrictedZones: Extract<CadObject, { type: "restrictedZone" }>[];
}) {
  const seed = createSolarPanel({ x: 0, y: 0 }, module, layerId, zIndexStart, orientation);
  seed.rotation = roof.azimuth;
  const roofBox = getBoundingBox(roof);
  const origin = { x: roofBox.x + roofBox.width / 2, y: roofBox.y + roofBox.height / 2 };
  const usableRoofPoints = roofUsablePolygon(roof, 25.4);
  const localRoofPoints = usableRoofPoints.map((point) => rotatePoint(point, origin, -roof.azimuth));
  const box = boundsFromPoints(localRoofPoints);
  const startX = box.x;
  const startY = box.y;
  const maxX = box.x + box.width - seed.width;
  const maxY = box.y + box.height - seed.height;
  const panels: SolarPanelObject[] = [];
  let skipped = 0;
  const rowLimit = Math.min(rows, 120);
  const columnLimit = Math.min(columns, 120);

  if (localRoofPoints.length < 3 || maxX < startX || maxY < startY) {
    return { panels, skipped: rowLimit * columnLimit };
  }

  for (let row = 0; row < rowLimit; row += 1) {
    const y = startY + row * (seed.height + gap);
    if (y > maxY) break;
    for (let column = 0; column < columnLimit; column += 1) {
      const x = startX + column * (seed.width + gap);
      if (x > maxX) break;
      const localPanelPoints = [
        { x, y },
        { x: x + seed.width, y },
        { x: x + seed.width, y: y + seed.height },
        { x, y: y + seed.height }
      ];
      if (!polygonContainsPolygon(localRoofPoints, localPanelPoints)) {
        skipped += 1;
        continue;
      }
      const topLeftWorld = rotatePoint({ x, y }, origin, roof.azimuth);
      const panel = createSolarPanel(
        topLeftWorld,
        module,
        layerId,
        zIndexStart + panels.length,
        orientation
      );
      panel.moduleGap = gap;
      panel.rotation = roof.azimuth;
      if (validatePanelPlacement(panel, { roofs: [roof], existingPanels: [...existingPanels, ...panels], obstructions, restrictedZones, clearanceMm: 25.4 }).valid) {
        panels.push(panel);
      } else {
        skipped += 1;
      }
    }
  }

  return { panels, skipped };
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
