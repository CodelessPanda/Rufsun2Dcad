import { describe, expect, it } from "vitest";
import type { MapCaptureSettings } from "../../types/cad";
import { createSolarGeoTransform } from "./solarGeoTransform";
import type { SolarFluxRaster } from "./solarFlux";

describe("createSolarGeoTransform", () => {
  it("maps GeoTIFF raster corners and center between geo and RufsunCAD world coordinates", () => {
    const transform = createSolarGeoTransform(mapFixture, rasterFixture);

    const topLeft = transform.geoToRasterPixel(rasterFixture.metadata.cornersWgs84.topLeft.latitude, rasterFixture.metadata.cornersWgs84.topLeft.longitude);
    const bottomRight = transform.geoToRasterPixel(rasterFixture.metadata.cornersWgs84.bottomRight.latitude, rasterFixture.metadata.cornersWgs84.bottomRight.longitude);
    expect(topLeft.x).toBeCloseTo(0, 6);
    expect(topLeft.y).toBeCloseTo(0, 6);
    expect(bottomRight.x).toBeCloseTo(10, 6);
    expect(bottomRight.y).toBeCloseTo(10, 6);
    const centerGeo = transform.rasterPixelToGeo(5, 5);
    expect(centerGeo.latitude).toBeCloseTo(28.6, 6);
    expect(centerGeo.longitude).toBeCloseTo(77.2, 6);

    const world = transform.geoToWorld(28.6, 77.2);
    const geo = transform.worldToGeo(world.x, world.y);
    expect(geo.latitude).toBeCloseTo(28.6, 6);
    expect(geo.longitude).toBeCloseTo(77.2, 6);
  });

  it("applies registration to both rendered raster position and inverse sampling", () => {
    const transform = createSolarGeoTransform(mapFixture, rasterFixture, {
      eastOffsetMeters: 2,
      northOffsetMeters: -1,
      rotationDegrees: 0,
      scale: 1,
      calibrated: true
    });
    const rawTransform = createSolarGeoTransform(mapFixture, rasterFixture);
    const rawCenter = rawTransform.rasterPixelToWorld(5, 5);
    const registeredCenter = transform.rasterPixelToWorld(5, 5);

    expect(registeredCenter.x - rawCenter.x).toBeCloseTo(2000, 0);
    expect(registeredCenter.y - rawCenter.y).toBeCloseTo(1000, 0);
    const sampledPixel = transform.worldToRasterPixel(registeredCenter.x, registeredCenter.y);
    expect(sampledPixel.x).toBeCloseTo(5, 6);
    expect(sampledPixel.y).toBeCloseTo(5, 6);
  });
});

const mapFixture: MapCaptureSettings = {
  latitude: 28.6,
  longitude: 77.2,
  zoom: 20,
  widthM: 100,
  heightM: 100,
  imageWidthPx: 640,
  imageHeightPx: 640,
  mapType: "satellite"
};

const rasterFixture: SolarFluxRaster = {
  kind: "annualFlux",
  width: 10,
  height: 10,
  values: new Float32Array(100).fill(1200),
  min: 1000,
  max: 1400,
  noDataValue: -9999,
  metadata: {
    width: 10,
    height: 10,
    sourceCrs: "WGS84",
    sourceIsWgs84: true,
    bboxSource: [77.1998, 28.5998, 77.2002, 28.6002],
    bboxWgs84: { north: 28.6002, south: 28.5998, west: 77.1998, east: 77.2002 },
    cornersSource: {
      topLeft: { x: 77.1998, y: 28.6002 },
      topRight: { x: 77.2002, y: 28.6002 },
      bottomRight: { x: 77.2002, y: 28.5998 },
      bottomLeft: { x: 77.1998, y: 28.5998 }
    },
    cornersWgs84: {
      topLeft: { latitude: 28.6002, longitude: 77.1998 },
      topRight: { latitude: 28.6002, longitude: 77.2002 },
      bottomRight: { latitude: 28.5998, longitude: 77.2002 },
      bottomLeft: { latitude: 28.5998, longitude: 77.1998 }
    },
    pixelSize: { x: 0.00004, y: -0.00004 },
    warnings: []
  },
  pixelToSourceCoordinate: (x, y) => ({
    x: 77.1998 + x * 0.00004,
    y: 28.6002 - y * 0.00004
  }),
  sourceCoordinateToPixel: (x, y) => ({
    x: (x - 77.1998) / 0.00004,
    y: (28.6002 - y) / 0.00004
  }),
  sourceCoordinateToLatLng: (x, y) => ({ latitude: y, longitude: x }),
  latLngToSourceCoordinate: (latitude, longitude) => ({ x: longitude, y: latitude })
};
