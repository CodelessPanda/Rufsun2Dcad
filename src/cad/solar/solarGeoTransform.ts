import type { MapCaptureSettings, Point } from "../../types/cad";
import type { SolarFluxRaster } from "./solarFlux";

export interface SolarGeoTransform {
  geoToWorld: (latitude: number, longitude: number) => Point;
  worldToGeo: (x: number, y: number) => { latitude: number; longitude: number };
  geoToRasterPixel: (latitude: number, longitude: number) => Point;
  rasterPixelToGeo: (x: number, y: number) => { latitude: number; longitude: number };
  rasterWorldRect: { x: number; y: number; width: number; height: number };
}

export function createSolarGeoTransform(map: MapCaptureSettings, raster: SolarFluxRaster): SolarGeoTransform {
  const centerPx = latLngToWorldPixel(map.latitude, map.longitude, map.zoom);
  const mapWidthWorld = map.widthM * 1000;
  const mapHeightWorld = map.heightM * 1000;
  const metersPerPixel = map.widthM / map.imageWidthPx;
  const worldPerMapPixel = metersPerPixel * 1000;

  const geoToWorld = (latitude: number, longitude: number): Point => {
    const pixel = latLngToWorldPixel(latitude, longitude, map.zoom);
    return {
      x: mapWidthWorld / 2 + (pixel.x - centerPx.x) * worldPerMapPixel,
      y: mapHeightWorld / 2 + (pixel.y - centerPx.y) * worldPerMapPixel
    };
  };

  const worldToGeo = (x: number, y: number) => {
    const pixel = {
      x: centerPx.x + (x - mapWidthWorld / 2) / worldPerMapPixel,
      y: centerPx.y + (y - mapHeightWorld / 2) / worldPerMapPixel
    };
    return worldPixelToLatLng(pixel.x, pixel.y, map.zoom);
  };

  const geoToRasterPixel = (latitude: number, longitude: number): Point => ({
    x: ((longitude - raster.bounds.west) / (raster.bounds.east - raster.bounds.west)) * raster.width,
    y: ((raster.bounds.north - latitude) / (raster.bounds.north - raster.bounds.south)) * raster.height
  });

  const rasterPixelToGeo = (x: number, y: number) => ({
    longitude: raster.bounds.west + (x / raster.width) * (raster.bounds.east - raster.bounds.west),
    latitude: raster.bounds.north - (y / raster.height) * (raster.bounds.north - raster.bounds.south)
  });

  const nw = geoToWorld(raster.bounds.north, raster.bounds.west);
  const se = geoToWorld(raster.bounds.south, raster.bounds.east);

  return {
    geoToWorld,
    worldToGeo,
    geoToRasterPixel,
    rasterPixelToGeo,
    rasterWorldRect: {
      x: nw.x,
      y: nw.y,
      width: se.x - nw.x,
      height: se.y - nw.y
    }
  };
}

function latLngToWorldPixel(latitude: number, longitude: number, zoom: number) {
  const siny = Math.max(-0.9999, Math.min(0.9999, Math.sin((latitude * Math.PI) / 180)));
  const scale = 256 * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale
  };
}

function worldPixelToLatLng(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}
