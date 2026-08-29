import type { MapCaptureSettings, Point, SolarRegistration } from "../../types/cad";
import type { LatLng, SolarRasterBase } from "./solarRaster";

export interface SolarGeoTransform {
  geoToWorld: (latitude: number, longitude: number) => Point;
  worldToGeo: (x: number, y: number) => LatLng;
  geoToRasterPixel: (latitude: number, longitude: number) => Point;
  rasterPixelToGeo: (x: number, y: number) => LatLng;
  worldToRasterPixel: (x: number, y: number) => Point;
  rasterPixelToWorld: (x: number, y: number) => Point;
  geoTiffPixelToSourceCoordinate: (x: number, y: number) => Point;
  sourceCoordinateToLatLng: (x: number, y: number) => LatLng;
  latLngToGeoTiffPixel: (latitude: number, longitude: number) => Point;
  applyRegistration: (point: Point) => Point;
  removeRegistration: (point: Point) => Point;
  metersToLatLngOffset: (eastMeters: number, northMeters: number, latitude?: number) => { latitudeDelta: number; longitudeDelta: number };
  latLngOffsetToMeters: (latitudeDelta: number, longitudeDelta: number, latitude?: number) => { eastMeters: number; northMeters: number };
  rotatePointAroundRasterCenter: (point: Point, degrees: number) => Point;
  rasterWorldRect: { x: number; y: number; width: number; height: number };
  rasterWorldQuad: {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
  };
  registration: SolarRegistration;
  diagnostics: SolarTransformDiagnostics;
}

export interface SolarTransformDiagnostics {
  sourceCrs: string;
  rasterDimensions: { width: number; height: number };
  pixelResolution: { x: number; y: number };
  sourceBoundingBox: [number, number, number, number];
  wgs84BoundingBox: SolarRasterBase["metadata"]["bboxWgs84"];
  registration: SolarRegistration;
  warnings: string[];
}

export const DEFAULT_SOLAR_REGISTRATION: SolarRegistration = {
  eastOffsetMeters: 0,
  northOffsetMeters: 0,
  rotationDegrees: 0,
  scale: 1,
  calibrated: false
};

export function normalizeSolarRegistration(registration?: Partial<SolarRegistration>): SolarRegistration {
  return {
    eastOffsetMeters: safeNumber(registration?.eastOffsetMeters, 0),
    northOffsetMeters: safeNumber(registration?.northOffsetMeters, 0),
    rotationDegrees: safeNumber(registration?.rotationDegrees, 0),
    scale: Math.max(0.5, Math.min(1.5, safeNumber(registration?.scale, 1))),
    calibrated: Boolean(registration?.calibrated)
  };
}

export function createSolarGeoTransform(
  map: MapCaptureSettings,
  raster: SolarRasterBase,
  registrationInput?: Partial<SolarRegistration>
): SolarGeoTransform {
  const registration = normalizeSolarRegistration(registrationInput);
  const centerPx = latLngToWorldPixel(map.latitude, map.longitude, map.zoom);
  const mapWidthWorld = map.widthM * 1000;
  const mapHeightWorld = map.heightM * 1000;
  const metersPerPixel = map.widthM / map.imageWidthPx;
  const worldPerMapPixel = metersPerPixel * 1000;

  const geoToWorldRaw = (latitude: number, longitude: number): Point => {
    const pixel = latLngToWorldPixel(latitude, longitude, map.zoom);
    return {
      x: mapWidthWorld / 2 + (pixel.x - centerPx.x) * worldPerMapPixel,
      y: mapHeightWorld / 2 + (pixel.y - centerPx.y) * worldPerMapPixel
    };
  };

  const worldToGeoRaw = (x: number, y: number) => {
    const pixel = {
      x: centerPx.x + (x - mapWidthWorld / 2) / worldPerMapPixel,
      y: centerPx.y + (y - mapHeightWorld / 2) / worldPerMapPixel
    };
    return worldPixelToLatLng(pixel.x, pixel.y, map.zoom);
  };

  const rawRasterCenter = geoToWorldRaw(
    (raster.metadata.cornersWgs84.topLeft.latitude + raster.metadata.cornersWgs84.bottomRight.latitude) / 2,
    (raster.metadata.cornersWgs84.topLeft.longitude + raster.metadata.cornersWgs84.bottomRight.longitude) / 2
  );

  const applyRegistration = (point: Point) => {
    const scaled = scalePoint(point, rawRasterCenter, registration.scale);
    const rotated = rotatePointAround(scaled, rawRasterCenter, registration.rotationDegrees);
    return {
      x: rotated.x + registration.eastOffsetMeters * 1000,
      y: rotated.y - registration.northOffsetMeters * 1000
    };
  };

  const removeRegistration = (point: Point) => {
    const translated = {
      x: point.x - registration.eastOffsetMeters * 1000,
      y: point.y + registration.northOffsetMeters * 1000
    };
    const unrotated = rotatePointAround(translated, rawRasterCenter, -registration.rotationDegrees);
    return scalePoint(unrotated, rawRasterCenter, 1 / registration.scale);
  };

  const rasterPixelToGeo = (x: number, y: number) => {
    const source = raster.pixelToSourceCoordinate(x, y);
    const rawGeo = raster.sourceCoordinateToLatLng(source.x, source.y);
    return worldToGeoRawPoint(applyRegistration(geoToWorldRaw(rawGeo.latitude, rawGeo.longitude)));
  };

  const geoToRasterPixel = (latitude: number, longitude: number) => {
    const unregisteredWorld = removeRegistration(geoToWorldRaw(latitude, longitude));
    const unregisteredGeo = worldToGeoRaw(unregisteredWorld.x, unregisteredWorld.y);
    const source = raster.latLngToSourceCoordinate(unregisteredGeo.latitude, unregisteredGeo.longitude);
    return raster.sourceCoordinateToPixel(source.x, source.y);
  };

  const rasterPixelToWorld = (x: number, y: number) => {
    const source = raster.pixelToSourceCoordinate(x, y);
    const rawGeo = raster.sourceCoordinateToLatLng(source.x, source.y);
    return applyRegistration(geoToWorldRaw(rawGeo.latitude, rawGeo.longitude));
  };

  const worldToRasterPixel = (x: number, y: number) => {
    const unregisteredWorld = removeRegistration({ x, y });
    const geo = worldToGeoRaw(unregisteredWorld.x, unregisteredWorld.y);
    const source = raster.latLngToSourceCoordinate(geo.latitude, geo.longitude);
    return raster.sourceCoordinateToPixel(source.x, source.y);
  };

  const rasterWorldQuad = {
    topLeft: rasterPixelToWorld(0, 0),
    topRight: rasterPixelToWorld(raster.width, 0),
    bottomRight: rasterPixelToWorld(raster.width, raster.height),
    bottomLeft: rasterPixelToWorld(0, raster.height)
  };
  const rasterWorldRect = boundsFromPoints(Object.values(rasterWorldQuad));
  const warnings = [...raster.metadata.warnings];
  if (!raster.metadata.sourceCrs || raster.metadata.sourceCrs === "WGS84") {
    warnings.push("Solar raster CRS was treated as WGS84; verify GeoKeys if overlay alignment looks wrong.");
  }

  const worldToGeoRawPoint = (point: Point) => worldToGeoRaw(point.x, point.y);

  return {
    geoToWorld: (latitude, longitude) => geoToWorldRaw(latitude, longitude),
    worldToGeo: (x, y) => worldToGeoRaw(x, y),
    geoToRasterPixel,
    rasterPixelToGeo,
    worldToRasterPixel,
    rasterPixelToWorld,
    geoTiffPixelToSourceCoordinate: raster.pixelToSourceCoordinate,
    sourceCoordinateToLatLng: raster.sourceCoordinateToLatLng,
    latLngToGeoTiffPixel: geoToRasterPixel,
    applyRegistration,
    removeRegistration,
    metersToLatLngOffset: (eastMeters, northMeters, latitude = map.latitude) => metersToLatLngOffset(eastMeters, northMeters, latitude),
    latLngOffsetToMeters: (latitudeDelta, longitudeDelta, latitude = map.latitude) => latLngOffsetToMeters(latitudeDelta, longitudeDelta, latitude),
    rotatePointAroundRasterCenter: (point, degrees) => rotatePointAround(point, rawRasterCenter, degrees),
    rasterWorldRect,
    rasterWorldQuad,
    registration,
    diagnostics: {
      sourceCrs: raster.metadata.sourceCrs,
      rasterDimensions: { width: raster.width, height: raster.height },
      pixelResolution: raster.metadata.pixelSize,
      sourceBoundingBox: raster.metadata.bboxSource,
      wgs84BoundingBox: raster.metadata.bboxWgs84,
      registration,
      warnings
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

function rotatePointAround(point: Point, origin: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos
  };
}

function scalePoint(point: Point, origin: Point, scale: number): Point {
  return {
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (point.y - origin.y) * scale
  };
}

function boundsFromPoints(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

function metersToLatLngOffset(eastMeters: number, northMeters: number, latitude: number) {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = Math.max(1, metersPerDegreeLatitude * Math.cos((latitude * Math.PI) / 180));
  return {
    latitudeDelta: northMeters / metersPerDegreeLatitude,
    longitudeDelta: eastMeters / metersPerDegreeLongitude
  };
}

function latLngOffsetToMeters(latitudeDelta: number, longitudeDelta: number, latitude: number) {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = Math.max(1, metersPerDegreeLatitude * Math.cos((latitude * Math.PI) / 180));
  return {
    eastMeters: longitudeDelta * metersPerDegreeLongitude,
    northMeters: latitudeDelta * metersPerDegreeLatitude
  };
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
