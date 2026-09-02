import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { panelFootprint } from "../geometry/polygonEngine";
import type { ProjectSolarDataState } from "./solarExposureTypes";
import { getPolygonFluxStatistics, getRoofFluxStatistics } from "./solarStatistics";

export function buildRoofAnnualFluxMap(roofs: RoofObject[], solarExposure?: ProjectSolarDataState): Record<string, number> | undefined {
  if (solarExposure?.status !== "ready" || !solarExposure.annualFlux || !solarExposure.transform) return undefined;
  const values: Record<string, number> = {};
  for (const roof of roofs) {
    const stats = getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform);
    if (stats && stats.samples > 0) values[roof.id] = stats.average;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

export function buildPanelAnnualFluxMap(panels: SolarPanelObject[], solarExposure?: ProjectSolarDataState): Record<string, number> | undefined {
  if (solarExposure?.status !== "ready" || !solarExposure.annualFlux || !solarExposure.transform) return undefined;
  const values: Record<string, number> = {};
  for (const panel of panels) {
    const stats = getPolygonFluxStatistics(panelFootprint(panel), solarExposure.annualFlux, solarExposure.transform);
    if (stats && stats.samples > 0) values[panel.id] = stats.average;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}
