import { describe, expect, it } from "vitest";
import type { RoofObject } from "../../types/cad";
import type { SolarFluxRaster } from "./solarFlux";
import { getRoofFluxStatistics } from "./solarStatistics";
import type { SolarGeoTransform } from "./solarGeoTransform";

describe("solar flux statistics", () => {
  it("samples only points inside the roof polygon and ignores invalid values", () => {
    const raster: SolarFluxRaster = {
      width: 4,
      height: 4,
      values: new Float32Array([
        1000, 1100, 1200, 1300,
        1050, -9999, 1250, 1350,
        1100, 1200, 1300, 1400,
        1150, 1250, 1350, 1450
      ]),
      bounds: { north: 1, south: 0, west: 0, east: 1 },
      min: 1000,
      max: 1450,
      noDataValue: -9999
    };
    const transform: SolarGeoTransform = {
      geoToWorld: (latitude, longitude) => ({ x: longitude * 400, y: (1 - latitude) * 400 }),
      worldToGeo: (x, y) => ({ latitude: 1 - y / 400, longitude: x / 400 }),
      geoToRasterPixel: (latitude, longitude) => ({ x: longitude * 4, y: (1 - latitude) * 4 }),
      rasterPixelToGeo: (x, y) => ({ latitude: 1 - y / 4, longitude: x / 4 }),
      rasterWorldRect: { x: 0, y: 0, width: 400, height: 400 }
    };
    const roof: RoofObject = {
      id: "roof",
      type: "roof",
      x: 0,
      y: 0,
      rotation: 0,
      layerId: "roof",
      visible: true,
      locked: false,
      zIndex: 1,
      name: "Roof A",
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 }
      ],
      stroke: "#16855f",
      fill: "transparent",
      tilt: 15,
      azimuth: 180,
      heightM: 10,
      setback: 0
    };

    const stats = getRoofFluxStatistics(roof, raster, transform);
    expect(stats).toMatchObject({
      samples: 3,
      min: 1000,
      max: 1100,
      average: 1050
    });
  });

  it("returns null when no valid pixels are inside the roof", () => {
    const raster: SolarFluxRaster = {
      width: 1,
      height: 1,
      values: new Float32Array([-9999]),
      bounds: { north: 1, south: 0, west: 0, east: 1 },
      min: 0,
      max: 0,
      noDataValue: -9999
    };
    const transform: SolarGeoTransform = {
      geoToWorld: () => ({ x: 0, y: 0 }),
      worldToGeo: () => ({ latitude: 0.5, longitude: 0.5 }),
      geoToRasterPixel: () => ({ x: 0, y: 0 }),
      rasterPixelToGeo: () => ({ latitude: 0.5, longitude: 0.5 }),
      rasterWorldRect: { x: 0, y: 0, width: 100, height: 100 }
    };
    const roof = {
      type: "roof",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
      ]
    } as RoofObject;

    expect(getRoofFluxStatistics(roof, raster, transform)).toBeNull();
  });
});
