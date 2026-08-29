import { useEffect, useState } from "react";
import { useCadStore } from "../../store/useCadStore";
import type { RoofObject } from "../../types/cad";
import { getRoofFluxStatistics, sampleFluxAtCanvasPoint } from "../../cad/solar/solarStatistics";
import { solarFluxLegendStops } from "../../cad/solar/solarPalette";
import type { ProjectSolarDataState, SolarDebugLayerState } from "../../cad/solar/solarExposureTypes";
import { DEFAULT_SOLAR_REGISTRATION } from "../../cad/solar/solarGeoTransform";

interface Props {
  roof?: RoofObject;
  solarExposure: ProjectSolarDataState;
  onLoad: () => void;
  onToggleVisible: (visible: boolean) => void;
  onUpdateDebugLayers: (patch: Partial<SolarDebugLayerState>) => void;
  onUpdateRegistration: (patch: Partial<NonNullable<ProjectSolarDataState["registration"]>>, calibrated?: boolean) => void;
}

export function SolarExposurePanel({
  roof,
  solarExposure,
  onLoad,
  onToggleVisible,
  onUpdateDebugLayers,
  onUpdateRegistration
}: Props) {
  const pointerWorld = useCadStore((state) => state.pointerWorld);
  const stats =
    roof && solarExposure.status === "ready" && solarExposure.annualFlux && solarExposure.transform
      ? getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform)
      : null;
  const stops = solarExposure.annualFlux ? solarFluxLegendStops(solarExposure.annualFlux.min, solarExposure.annualFlux.max) : [];
  const debugLayers = solarExposure.debugLayers ?? {
    googleSolarRgb: false,
    annualFlux: false,
    dsm: false,
    buildingMask: false,
    opacity: 0.5
  };
  const registration = solarExposure.registration ?? DEFAULT_SOLAR_REGISTRATION;
  const sample =
    solarExposure.status === "ready" && solarExposure.annualFlux && solarExposure.transform
      ? readPointerSample(solarExposure, pointerWorld.x, pointerWorld.y)
      : null;

  return (
    <div className="solar-exposure-box">
      <h3>Solar Exposure</h3>
      {solarExposure.status === "idle" && (
        <>
          <p className="fine-print">No solar data loaded.</p>
          <button className="primary-action" onClick={onLoad}>Load Solar Data</button>
        </>
      )}
      {solarExposure.status === "loading" && <p className="info-message">Loading solar exposure...</p>}
      {solarExposure.status === "error" && (
        <>
          <p className="warning">{solarExposure.error || "Unable to load Solar API data. Please try again."}</p>
          <button className="secondary-action" onClick={onLoad}>Retry</button>
        </>
      )}
      {solarExposure.status === "ready" && (
        <>
          <Stat label="Data Quality" value={solarExposure.dataLayers?.imageryQuality || "-"} />
          {roof ? (
            <>
              <Stat label="Average Annual Flux" value={stats ? `${stats.average.toLocaleString()} kWh/kW/year` : "No valid roof pixels"} />
              <Stat label="Range" value={stats ? `${stats.min.toLocaleString()} - ${stats.max.toLocaleString()}` : "-"} />
              <Stat label="Samples" value={stats?.samples ?? 0} />
            </>
          ) : (
            <p className="fine-print">Select a roof to view roof-specific annual flux numbers.</p>
          )}
          <label className="toggle-row">
            <span>Show Heatmap</span>
            <input type="checkbox" checked={solarExposure.visible} onChange={(event) => onToggleVisible(event.target.checked)} />
          </label>
          <div className="solar-legend">
            <div className="solar-legend-labels">
              <span>Low</span>
              <span>High</span>
            </div>
            <div className="solar-legend-bar">
              {stops.map((stop) => (
                <span key={stop.value} style={{ background: stop.color }} />
              ))}
            </div>
            {solarExposure.annualFlux && (
              <div className="solar-legend-values">
                <span>{Math.round(solarExposure.annualFlux.min).toLocaleString()}</span>
                <span>{Math.round(solarExposure.annualFlux.max).toLocaleString()}</span>
              </div>
            )}
            <em>kWh/kW/year</em>
          </div>
          <details className="solar-debug-panel">
            <summary>Solar Debug Layers</summary>
            <Toggle label="Google Solar RGB" checked={debugLayers.googleSolarRgb} disabled={!solarExposure.rgb} onChange={(checked) => onUpdateDebugLayers({ googleSolarRgb: checked })} />
            <Toggle label="Annual Flux" checked={debugLayers.annualFlux} onChange={(checked) => onUpdateDebugLayers({ annualFlux: checked })} />
            <Toggle label="Building Mask" checked={debugLayers.buildingMask} disabled={!solarExposure.mask} onChange={(checked) => onUpdateDebugLayers({ buildingMask: checked })} />
            <Toggle label="DSM" checked={debugLayers.dsm} disabled={!solarExposure.dsm} onChange={(checked) => onUpdateDebugLayers({ dsm: checked })} />
            <NumberField
              label="Debug opacity"
              value={Math.round(debugLayers.opacity * 100)}
              suffix="%"
              onCommit={(value) => onUpdateDebugLayers({ opacity: Math.max(0.1, Math.min(1, value / 100)) })}
            />
          </details>
          <details className="solar-debug-panel" open={debugLayers.googleSolarRgb}>
            <summary>Align Solar Data</summary>
            <Stat label="X Offset" value={`${registration.eastOffsetMeters.toFixed(2)} m`} />
            <Stat label="Y Offset" value={`${registration.northOffsetMeters.toFixed(2)} m`} />
            <Stat label="Rotation" value={`${registration.rotationDegrees.toFixed(2)} deg`} />
            <div className="alignment-nudge-grid">
              <button onClick={() => nudge(onUpdateRegistration, registration, 0, 0.1)}>Up 0.1m</button>
              <button onClick={() => nudge(onUpdateRegistration, registration, -0.1, 0)}>Left 0.1m</button>
              <button onClick={() => nudge(onUpdateRegistration, registration, 0.1, 0)}>Right 0.1m</button>
              <button onClick={() => nudge(onUpdateRegistration, registration, 0, -0.1)}>Down 0.1m</button>
            </div>
            <NumberField label="East / West" value={registration.eastOffsetMeters} suffix="m" onCommit={(eastOffsetMeters) => onUpdateRegistration({ eastOffsetMeters })} />
            <NumberField label="North / South" value={registration.northOffsetMeters} suffix="m" onCommit={(northOffsetMeters) => onUpdateRegistration({ northOffsetMeters })} />
            <NumberField label="Rotation" value={registration.rotationDegrees} suffix="deg" onCommit={(rotationDegrees) => onUpdateRegistration({ rotationDegrees })} />
            <NumberField label="Scale" value={registration.scale} onCommit={(scale) => onUpdateRegistration({ scale: Math.max(0.5, Math.min(1.5, scale)) })} />
            <div className="layout-actions">
              <button className="secondary-action" onClick={() => onUpdateRegistration(DEFAULT_SOLAR_REGISTRATION, false)}>Reset</button>
              <button className="primary-action" onClick={() => onUpdateRegistration({ calibrated: true }, true)}>Save Alignment</button>
            </div>
          </details>
          <details className="solar-debug-panel">
            <summary>Solar Raster Diagnostics</summary>
            {solarExposure.transform && <Diagnostics solarExposure={solarExposure} />}
            {sample && (
              <>
                <Stat label="Pointer Lat/Lng" value={`${sample.latitude.toFixed(6)}, ${sample.longitude.toFixed(6)}`} />
                <Stat label="Solar Pixel" value={`X ${sample.pixel.x.toFixed(1)}, Y ${sample.pixel.y.toFixed(1)}`} />
                <Stat label="Annual Flux" value={sample.value === null ? "-" : `${sample.value.toLocaleString()} kWh/kW/year`} />
              </>
            )}
          </details>
          <button className="secondary-action" onClick={onLoad}>Refresh Solar Data</button>
        </>
      )}
    </div>
  );
}

function Diagnostics({ solarExposure }: { solarExposure: ProjectSolarDataState }) {
  const diagnostics = solarExposure.transform?.diagnostics;
  if (!diagnostics) return null;
  const box = diagnostics.wgs84BoundingBox;
  return (
    <>
      <Stat label="Raster" value="Annual Flux" />
      <Stat label="Source CRS" value={diagnostics.sourceCrs || "-"} />
      <Stat label="Raster dimensions" value={`${diagnostics.rasterDimensions.width} x ${diagnostics.rasterDimensions.height}`} />
      <Stat label="Pixel resolution" value={`${diagnostics.pixelResolution.x.toFixed(3)}, ${diagnostics.pixelResolution.y.toFixed(3)}`} />
      <Stat label="WGS84 bounds" value={`${box.south.toFixed(6)}, ${box.west.toFixed(6)} to ${box.north.toFixed(6)}, ${box.east.toFixed(6)}`} />
      {diagnostics.warnings.map((warning) => (
        <p key={warning} className="warning">{warning}</p>
      ))}
    </>
  );
}

function readPointerSample(solarExposure: ProjectSolarDataState, x: number, y: number) {
  if (!solarExposure.annualFlux || !solarExposure.transform) return null;
  const geo = solarExposure.transform.worldToGeo(x, y);
  const pixel = solarExposure.transform.worldToRasterPixel(x, y);
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    pixel,
    value: sampleFluxAtCanvasPoint(solarExposure.annualFlux, solarExposure.transform, x, y)
  };
}

function nudge(
  onUpdateRegistration: Props["onUpdateRegistration"],
  registration: NonNullable<ProjectSolarDataState["registration"]>,
  east: number,
  north: number
) {
  onUpdateRegistration({
    eastOffsetMeters: registration.eastOffsetMeters + east,
    northOffsetMeters: registration.northOffsetMeters + north
  });
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
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
