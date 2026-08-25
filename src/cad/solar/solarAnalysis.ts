import type { RoofObject } from "../../types/cad";
import type { ProjectSolarDataState } from "./solarExposureTypes";
import { getRoofFluxStatistics } from "./solarStatistics";

export function buildRoofAnnualFluxMap(roofs: RoofObject[], solarExposure?: ProjectSolarDataState): Record<string, number> | undefined {
  if (solarExposure?.status !== "ready" || !solarExposure.annualFlux || !solarExposure.transform) return undefined;
  const values: Record<string, number> = {};
  for (const roof of roofs) {
    const stats = getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform);
    if (stats && stats.samples > 0) values[roof.id] = stats.average;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}
