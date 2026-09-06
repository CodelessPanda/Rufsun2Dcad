import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { findContainingRoof } from "../geometry/geometry";
import { panelFootprint } from "../geometry/polygonEngine";
import type { ProjectSolarDataState } from "./solarExposureTypes";
import type { PanelFluxSample } from "./solarStatistics";
import { getRoofFluxStatistics, samplePanelFluxRobust } from "./solarStatistics";

/** Flux reading attached to a single panel. */
export interface PanelFluxEntry {
  flux: number;
  method: "area-avg" | "center-point" | "roof-avg";
}

export type PanelFluxMap = Record<string, PanelFluxEntry>;
export type RoofFluxMap = Record<string, number>;

export function buildRoofAnnualFluxMap(roofs: RoofObject[], solarExposure?: ProjectSolarDataState): RoofFluxMap | undefined {
  if (solarExposure?.status !== "ready" || !solarExposure.annualFlux || !solarExposure.transform) return undefined;
  const values: RoofFluxMap = {};
  for (const roof of roofs) {
    const stats = getRoofFluxStatistics(roof, solarExposure.annualFlux, solarExposure.transform);
    // TRACE
    const firstPt = roof.points[0];
    const firstPx = firstPt ? solarExposure.transform.worldToRasterPixel(firstPt.x, firstPt.y) : null;
    const firstLatLng = firstPt && typeof solarExposure.transform.worldToGeo === "function"
      ? solarExposure.transform.worldToGeo(firstPt.x, firstPt.y) : null;
    console.warn("[FluxSampler] roof", roof.id,
      "\n  firstWorldPt:", firstPt,
      "\n  firstLatLng:", firstLatLng,
      "\n  -> rasterPx:", firstPx,
      "\n  rasterBounds px:", { w: solarExposure.annualFlux.width, h: solarExposure.annualFlux.height },
      "\n  stats:", stats);


    if (stats && stats.samples > 0) values[roof.id] = stats.average;
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

export function buildPanelAnnualFluxMap(
  panels: SolarPanelObject[],
  roofs: RoofObject[],
  solarExposure?: ProjectSolarDataState
): PanelFluxMap | undefined {
  if (solarExposure?.status !== "ready" || !solarExposure.annualFlux || !solarExposure.transform) return undefined;

  const { annualFlux, transform } = solarExposure;
  const roofAvgMap = buildRoofAnnualFluxMap(roofs, solarExposure) ?? {};
  const result: PanelFluxMap = {};

  for (const panel of panels) {
    const cx = panel.x + panel.width / 2;
    const cy = panel.y + panel.height / 2;
    const centerPx = transform.worldToRasterPixel(cx, cy);
    const footprint = panelFootprint(panel);
    const footprintPx = footprint.map(pt => transform.worldToRasterPixel(pt.x, pt.y));

    const sample: PanelFluxSample | null = samplePanelFluxRobust(panel, annualFlux, transform);
    console.warn("[FluxSampler] panel", panel.id,
      "center_mm:", { cx, cy },
      "centerPx:", centerPx,
      "footprintPx:", footprintPx,
      "rasterMax:", { w: annualFlux.width, h: annualFlux.height },
      "sample:", sample);

    if (sample) {
      result[panel.id] = { flux: sample.flux, method: sample.method };
      continue;
    }

    const containingRoof = findContainingRoof(panel, roofs);
    if (containingRoof && roofAvgMap[containingRoof.id] !== undefined) {
      result[panel.id] = { flux: roofAvgMap[containingRoof.id], method: "roof-avg" };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
