import type { RoofObject } from "../../types/cad";
import { getRoofFluxStatistics } from "../../cad/solar/solarStatistics";
import { solarFluxLegendStops } from "../../cad/solar/solarPalette";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";

interface Props {
  roof?: RoofObject;
  solarExposure: ProjectSolarDataState;
  onLoad: () => void;
  onToggleVisible: (visible: boolean) => void;
}

export function SolarExposurePanel({ roof, solarExposure, onLoad, onToggleVisible }: Props) {
  const stats =
    roof && solarExposure.status === "ready" && solarExposure.annualFlux && solarExposure.transform
      ? getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform)
      : null;
  const stops = solarExposure.annualFlux ? solarFluxLegendStops(solarExposure.annualFlux.min, solarExposure.annualFlux.max) : [];

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
          <button className="secondary-action" onClick={onLoad}>Refresh Solar Data</button>
        </>
      )}
    </div>
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
