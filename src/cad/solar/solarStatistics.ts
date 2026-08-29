import type { Point, RoofObject } from "../../types/cad";
import { pointInsidePolygon } from "../geometry/geometry";
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
