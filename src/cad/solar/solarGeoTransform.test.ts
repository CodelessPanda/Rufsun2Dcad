import { describe, expect, it } from "vitest";
import type { MapCaptureSettings } from "../../types/cad";
import type { SolarFluxRaster } from "./solarFlux";
import { createSolarGeoTransform } from "./solarGeoTransform";

describe("createSolarGeoTransform", () => {
  it("maps raster corners and center between geo and RufsunCAD world coordinates", () => {
    const map: MapCaptureSettings = {
      latitude: 28.6,
      longitude: 77.2,
      zoom: 20,
      widthM: 100,
      heightM: 100,
      imageWidthPx: 640,
      imageHeightPx: 640,
      mapType: "satellite"
    };
    const raster: SolarFluxRaster = {
      width: 10,
      height: 10,
      values: new Float32Array(100).fill(1200),
      bounds: { north: 28.6002, south: 28.5998, west: 77.1998, east: 77.2002 },
      min: 1000,
      max: 1400,
      noDataValue: -9999
    };
    const transform = createSolarGeoTransform(map, raster);

    expect(transform.geoToRasterPixel(raster.bounds.north, raster.bounds.west)).toEqual({ x: 0, y: 0 });
    expect(transform.geoToRasterPixel(raster.bounds.south, raster.bounds.east)).toEqual({ x: 10, y: 10 });
    const centerGeo = transform.rasterPixelToGeo(5, 5);
    expect(centerGeo.latitude).toBeCloseTo(28.6, 6);
    expect(centerGeo.longitude).toBeCloseTo(77.2, 6);

    const world = transform.geoToWorld(28.6, 77.2);
    const geo = transform.worldToGeo(world.x, world.y);
    expect(geo.latitude).toBeCloseTo(28.6, 6);
    expect(geo.longitude).toBeCloseTo(77.2, 6);
  });
});
