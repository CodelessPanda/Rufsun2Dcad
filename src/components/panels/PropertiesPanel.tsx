import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useCadStore, selectedSolarStats } from "../../store/useCadStore";
import type { CadObject, RoofObject, SolarPanelObject } from "../../types/cad";
import { sampleSolarModules } from "../../data/sampleSolarModules";
import { buildSolarArray } from "../../cad/array/array";
import { formatMetric, polygonArea, distance, angle } from "../../cad/geometry/geometry";

export function PropertiesPanel() {
  const document = useCadStore((state) => state.document);
  const selectedIds = useCadStore((state) => state.selectedIds);
  const activeTool = useCadStore((state) => state.activeTool);
  const selectedModuleId = useCadStore((state) => state.selectedModuleId);
  const setSelectedModuleId = useCadStore((state) => state.setSelectedModuleId);
  const updateObject = useCadStore((state) => state.updateObject);
  const addObjects = useCadStore((state) => state.addObjects);
  const setDocument = useCadStore((state) => state.setDocument);
  const setLayer = useCadStore((state) => state.setLayer);
  const setActiveLayer = useCadStore((state) => state.setActiveLayer);
  const selectedObjects = document.objects.filter((object) => selectedIds.includes(object.id));

  return (
    <aside className="properties-panel">
      {activeTool === "solar" && (
        <section className="panel-section">
          <h2>Solar Module</h2>
          <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
            {sampleSolarModules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.manufacturer} {module.model} · {module.wattage} W · {module.widthMM}×{module.heightMM} mm
              </option>
            ))}
          </select>
          <p className="fine-print">Generic/sample module data for prototype use.</p>
        </section>
      )}

      {selectedObjects.length === 0 ? <DocumentSummary /> : selectedObjects.length === 1 ? <SingleObject object={selectedObjects[0]} updateObject={updateObject} addObjects={addObjects} /> : <MultiSelection objects={selectedObjects} />}

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

      <section className="panel-section compact">
        <h2>Grid</h2>
        <Toggle label="Visible" checked={document.settings.grid.visible} onChange={(visible) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, visible } } })} />
        <NumberField label="Minor" value={document.settings.grid.minor} suffix="mm" onCommit={(minor) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, minor } } })} />
        <NumberField label="Major" value={document.settings.grid.major} suffix="mm" onCommit={(major) => setDocument({ ...document, settings: { ...document.settings, grid: { ...document.settings.grid, major } } })} />
      </section>

      <section className="panel-section compact">
        <h2>Snapping</h2>
        {(["enabled", "grid", "endpoints", "midpoints", "centers", "edges", "alignment"] as const).map((key) => (
          <Toggle
            key={key}
            label={key[0].toUpperCase() + key.slice(1)}
            checked={document.settings.snap[key]}
            onChange={(checked) => setDocument({ ...document, settings: { ...document.settings, snap: { ...document.settings.snap, [key]: checked } } })}
          />
        ))}
        <NumberField label="Tolerance" value={document.settings.snap.tolerancePx} suffix="px" onCommit={(tolerancePx) => setDocument({ ...document, settings: { ...document.settings, snap: { ...document.settings.snap, tolerancePx } } })} />
      </section>
    </aside>
  );
}

function DocumentSummary() {
  const document = useCadStore((state) => state.document);
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const panels = document.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const watts = panels.reduce((sum, panel) => sum + panel.wattage, 0);
  const roofArea = roofs.reduce((sum, roof) => sum + polygonArea(roof.points), 0) / 1_000_000;
  return (
    <section className="panel-section stats">
      <h2>Project</h2>
      <Stat label="Name" value={document.name} />
      <Stat label="Objects" value={document.objects.length} />
      <Stat label="Solar modules" value={panels.length} />
      <Stat label="DC capacity" value={`${(watts / 1000).toFixed(2)} kWp`} />
      <Stat label="Roof areas" value={roofs.length} />
      <Stat label="Total roof area" value={`${roofArea.toFixed(1)} m2`} />
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
      <NumberField label="Rotation" value={object.rotation} suffix="deg" onCommit={(rotation) => updateObject(object.id, { rotation } as Partial<CadObject>)} />
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
    addObjects(newPanels, [object.id, ...newPanels.map((panel) => panel.id)]);
  };

  return (
    <>
      <Stat label="Manufacturer" value={object.manufacturer} />
      <Stat label="Model" value={object.model} />
      <NumberField label="Width" value={object.width} suffix="mm" onCommit={(width) => updateObject(object.id, { width: Math.max(20, width) } as Partial<CadObject>)} />
      <NumberField label="Height" value={object.height} suffix="mm" onCommit={(height) => updateObject(object.id, { height: Math.max(20, height) } as Partial<CadObject>)} />
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
  const area = polygonArea(object.points) / 1_000_000;
  return (
    <>
      <label className="field">
        <span>Name</span>
        <input value={object.name} onChange={(event) => updateObject(object.id, { name: event.target.value } as Partial<CadObject>)} />
      </label>
      <Stat label="Area" value={`${area.toFixed(1)} m2`} />
      <NumberField label="Tilt" value={object.tilt} suffix="deg" onCommit={(tilt) => updateObject(object.id, { tilt } as Partial<CadObject>)} />
      <NumberField label="Azimuth" value={object.azimuth} suffix="deg" onCommit={(azimuth) => updateObject(object.id, { azimuth } as Partial<CadObject>)} />
      <NumberField label="Height" value={object.heightM} suffix="m" onCommit={(heightM) => updateObject(object.id, { heightM } as Partial<CadObject>)} />
      <NumberField label="Setback" value={object.setback} suffix="mm" onCommit={(setback) => updateObject(object.id, { setback: Math.max(0, setback) } as Partial<CadObject>)} />
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

function labelFor(object: CadObject) {
  const labels: Record<CadObject["type"], string> = {
    line: "Line",
    rectangle: "Rectangle",
    circle: "Circle",
    polygon: "Polygon",
    text: "Text",
    dimension: "Dimension",
    solarPanel: "Solar Module",
    roof: "Roof"
  };
  return labels[object.type];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
