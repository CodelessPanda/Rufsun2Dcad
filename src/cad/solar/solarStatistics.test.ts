import { describe, expect, it } from "vitest";
import type { RoofObject } from "../../types/cad";
import type { SolarFluxRaster } from "./solarFlux";
import { getRoofFluxStatistics } from "./solarStatistics";
import type { SolarGeoTransform } from "./solarGeoTransform";

describe("solar flux statistics", () => {
  it("samples only points inside the roof polygon and ignores invalid values", () => {
    const raster: SolarFluxRaster = {
      kind: "annualFlux",
      width: 4,
      height: 4,
      values: new Float32Array([
        1000, 1100, 1200, 1300,
        1050, -9999, 1250, 1350,
        1100, 1200, 1300, 1400,
        1150, 1250, 1350, 1450
      ]),
      min: 1000,
      max: 1450,
      noDataValue: -9999,
      ...rasterGeo(4, 4)
    };
    const transform: SolarGeoTransform = {
      geoToWorld: (latitude, longitude) => ({ x: longitude * 400, y: (1 - latitude) * 400 }),
      worldToGeo: (x, y) => ({ latitude: 1 - y / 400, longitude: x / 400 }),
      geoToRasterPixel: (latitude, longitude) => ({ x: longitude * 4, y: (1 - latitude) * 4 }),
      rasterPixelToGeo: (x, y) => ({ latitude: 1 - y / 4, longitude: x / 4 }),
      worldToRasterPixel: (x, y) => ({ x: x / 100, y: y / 100 }),
      rasterPixelToWorld: (x, y) => ({ x: x * 100, y: y * 100 }),
      geoTiffPixelToSourceCoordinate: (x, y) => ({ x: x / 4, y: 1 - y / 4 }),
      sourceCoordinateToLatLng: (x, y) => ({ latitude: y, longitude: x }),
      latLngToGeoTiffPixel: (latitude, longitude) => ({ x: longitude * 4, y: (1 - latitude) * 4 }),
      applyRegistration: (point) => point,
      removeRegistration: (point) => point,
      metersToLatLngOffset: (eastMeters, northMeters) => ({ latitudeDelta: northMeters / 111_320, longitudeDelta: eastMeters / 111_320 }),
      latLngOffsetToMeters: (latitudeDelta, longitudeDelta) => ({ eastMeters: longitudeDelta * 111_320, northMeters: latitudeDelta * 111_320 }),
      rotatePointAroundRasterCenter: (point) => point,
      rasterWorldRect: { x: 0, y: 0, width: 400, height: 400 },
      rasterWorldQuad: {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 400, y: 0 },
        bottomRight: { x: 400, y: 400 },
        bottomLeft: { x: 0, y: 400 }
      },
      registration: { eastOffsetMeters: 0, northOffsetMeters: 0, rotationDegrees: 0, scale: 1, calibrated: false },
      diagnostics: {
        sourceCrs: "WGS84",
        rasterDimensions: { width: 4, height: 4 },
        pixelResolution: { x: 0.25, y: -0.25 },
        sourceBoundingBox: [0, 0, 1, 1],
        wgs84BoundingBox: { north: 1, south: 0, west: 0, east: 1 },
        registration: { eastOffsetMeters: 0, northOffsetMeters: 0, rotationDegrees: 0, scale: 1, calibrated: false },
        warnings: []
      }
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
      kind: "annualFlux",
      width: 1,
      height: 1,
      values: new Float32Array([-9999]),
      min: 0,
      max: 0,
      noDataValue: -9999,
      ...rasterGeo(1, 1)
    };
    const transform: SolarGeoTransform = {
      geoToWorld: () => ({ x: 0, y: 0 }),
      worldToGeo: () => ({ latitude: 0.5, longitude: 0.5 }),
      geoToRasterPixel: () => ({ x: 0, y: 0 }),
      rasterPixelToGeo: () => ({ latitude: 0.5, longitude: 0.5 }),
      worldToRasterPixel: () => ({ x: 0, y: 0 }),
      rasterPixelToWorld: () => ({ x: 0, y: 0 }),
      geoTiffPixelToSourceCoordinate: () => ({ x: 0, y: 0 }),
      sourceCoordinateToLatLng: () => ({ latitude: 0.5, longitude: 0.5 }),
      latLngToGeoTiffPixel: () => ({ x: 0, y: 0 }),
      applyRegistration: (point) => point,
      removeRegistration: (point) => point,
      metersToLatLngOffset: () => ({ latitudeDelta: 0, longitudeDelta: 0 }),
      latLngOffsetToMeters: () => ({ eastMeters: 0, northMeters: 0 }),
      rotatePointAroundRasterCenter: (point) => point,
      rasterWorldRect: { x: 0, y: 0, width: 100, height: 100 },
      rasterWorldQuad: {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 100, y: 0 },
        bottomRight: { x: 100, y: 100 },
        bottomLeft: { x: 0, y: 100 }
      },
      registration: { eastOffsetMeters: 0, northOffsetMeters: 0, rotationDegrees: 0, scale: 1, calibrated: false },
      diagnostics: {
        sourceCrs: "WGS84",
        rasterDimensions: { width: 1, height: 1 },
        pixelResolution: { x: 1, y: -1 },
        sourceBoundingBox: [0, 0, 1, 1],
        wgs84BoundingBox: { north: 1, south: 0, west: 0, east: 1 },
        registration: { eastOffsetMeters: 0, northOffsetMeters: 0, rotationDegrees: 0, scale: 1, calibrated: false },
        warnings: []
      }
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

function rasterGeo(width: number, height: number) {
  return {
    metadata: {
      width,
      height,
      sourceCrs: "WGS84",
      sourceIsWgs84: true,
      bboxSource: [0, 0, 1, 1] as [number, number, number, number],
      bboxWgs84: { north: 1, south: 0, west: 0, east: 1 },
      cornersSource: {
        topLeft: { x: 0, y: 1 },
        topRight: { x: 1, y: 1 },
        bottomRight: { x: 1, y: 0 },
        bottomLeft: { x: 0, y: 0 }
      },
      cornersWgs84: {
        topLeft: { latitude: 1, longitude: 0 },
        topRight: { latitude: 1, longitude: 1 },
        bottomRight: { latitude: 0, longitude: 1 },
        bottomLeft: { latitude: 0, longitude: 0 }
      },
      pixelSize: { x: 1 / width, y: -1 / height },
      warnings: []
    },
    pixelToSourceCoordinate: (x: number, y: number) => ({ x: x / width, y: 1 - y / height }),
    sourceCoordinateToPixel: (x: number, y: number) => ({ x: x * width, y: (1 - y) * height }),
    sourceCoordinateToLatLng: (x: number, y: number) => ({ latitude: y, longitude: x }),
    latLngToSourceCoordinate: (latitude: number, longitude: number) => ({ x: longitude, y: latitude })
  };
}
