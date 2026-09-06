import type { Point, RoofObject, SolarPanelObject } from "../../types/cad";
import { pointInsidePolygon } from "../geometry/geometry";
import { panelFootprint } from "../geometry/polygonEngine";
import type { SolarFluxRaster } from "./solarFlux";
import { isValidSolarFlux, sampleFluxAtPixel } from "./solarFlux";
import type { SolarGeoTransform } from "./solarGeoTransform";

export interface SolarFluxStatistics {
  average: number;
  min: number;
  max: number;
  median: number;
  samples: number;
}

/** The sampling strategy that was used for a given panel. */
export type FluxSamplingMethod = "area-avg" | "center-point";

export interface PanelFluxSample {
  /** Annual solar flux in kWh/kW/year at this panel's location. */
  flux: number;
  /** Which strategy produced this value. */
  method: FluxSamplingMethod;
}

/**
 * Robustly sample the annual solar flux for a single panel using a two-stage
 * fallback strategy:
 *
 * 1. **Area-average** — scan all raster pixels whose centres fall inside an
 *    inset version of the panel footprint (shrunk by half a raster pixel to
 *    avoid counting edge pixels that are only partially covered). Used when
 *    at least 2 valid pixel samples are found.
 * 2. **Center-point** — if fewer than 2 pixels hit (panel smaller than the
 *    raster resolution, or a registration offset shifted the footprint), fall
 *    back to sampling the single pixel under the panel's geometric centre.
 *    This guarantees a reading for every valid panel and never silently
 *    returns null.
 *
 * Returns `null` only when the panel is completely outside the raster bounds.
 */
export function samplePanelFluxRobust(
  panel: SolarPanelObject,
  raster: SolarFluxRaster,
  transform: SolarGeoTransform
): PanelFluxSample | null {
  const footprint = panelFootprint(panel);

  // ── Stage 1: area-average over inset polygon ─────────────────────────────
  // Estimate raster pixel size in world-units so we can shrink the footprint
  // by roughly half a pixel to avoid counting edge pixels.
  const pixelSizeInWorld = estimateRasterPixelWorldSize(raster, transform);
  const insetMm = pixelSizeInWorld * 0.5;
  const insetFootprint = insetPolygon(footprint, insetMm);
  const stats = getPolygonFluxStatistics(insetFootprint, raster, transform);

  if (stats && stats.samples >= 2) {
    return { flux: stats.average, method: "area-avg" };
  }

  // ── Stage 2: center-point fallback ────────────────────────────────────────
  const centerX = footprint.reduce((sum, p) => sum + p.x, 0) / footprint.length;
  const centerY = footprint.reduce((sum, p) => sum + p.y, 0) / footprint.length;
  const centerValue = sampleFluxAtCanvasPoint(raster, transform, centerX, centerY);

  if (centerValue !== null && isValidSolarFlux(centerValue, raster.noDataValue)) {
    return { flux: centerValue, method: "center-point" };
  }

  // Panel is completely outside raster bounds — caller uses roof-level average
  return null;
}

/**
 * Shrink a polygon towards its centroid by `insetMm` world-units.
 * This is a lightweight centroid-pull inset (accurate enough for near-rectangular
 * panel footprints, avoids a heavy geometric offset dependency).
 */
function insetPolygon(points: Point[], insetMm: number): Point[] {
  if (points.length < 3) return points;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return p;
    const scale = Math.max(0, (dist - insetMm) / dist);
    return { x: cx + dx * scale, y: cy + dy * scale };
  });
}

/**
 * Estimate the raster pixel size in world-units by mapping two adjacent raster
 * pixels through the geo-transform.
 */
function estimateRasterPixelWorldSize(raster: SolarFluxRaster, transform: SolarGeoTransform): number {
  try {
    const midY = Math.floor(raster.height / 2);
    const midX = Math.floor(raster.width / 2);
    const p0 = transform.rasterPixelToWorld(midX, midY);
    const p1 = transform.rasterPixelToWorld(midX + 1, midY);
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  } catch {
    return 500; // safe fallback: ~0.5 m expressed in mm world-units
  }
}

export function getRoofFluxStatistics(roof: RoofObject, raster: SolarFluxRaster, transform: SolarGeoTransform): SolarFluxStatistics | null {
  return getPolygonFluxStatistics(roof.points, raster, transform);
}

export function getPolygonFluxStatistics(points: Point[], raster: SolarFluxRaster, transform: SolarGeoTransform): SolarFluxStatistics | null {
  if (points.length < 3) return null;
  const pixelPoints = points.map((point) => transform.worldToRasterPixel(point.x, point.y));
  const xs = pixelPoints.map((point) => point.x);
  const ys = pixelPoints.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(raster.width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(raster.height - 1, Math.ceil(Math.max(...ys)));
  const values: number[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInsidePolygon({ x: x + 0.5, y: y + 0.5 }, pixelPoints)) continue;
      const value = sampleFluxAtPixel(raster, x, y);
      if (value !== null && isValidSolarFlux(value, raster.noDataValue)) values.push(value);
    }
  }

  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    average: round(total / values.length),
    min: round(values[0]),
    max: round(values[values.length - 1]),
    median: round(values[Math.floor(values.length / 2)]),
    samples: values.length
  };
}

export function sampleFluxAtGeoPoint(raster: SolarFluxRaster, transform: SolarGeoTransform, latitude: number, longitude: number) {
  const pixel = transform.geoToRasterPixel(latitude, longitude);
  return sampleFluxAtPixel(raster, pixel.x, pixel.y);
}

export function sampleFluxAtCanvasPoint(raster: SolarFluxRaster, transform: SolarGeoTransform, x: number, y: number) {
  const pixel = transform.worldToRasterPixel(x, y);
  return sampleFluxAtPixel(raster, pixel.x, pixel.y);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
