import type { ImageryMetadata, MapCaptureSettings, Point, ScaleCalibration } from "../../types/cad";

const EARTH_METERS_PER_DEGREE = 111_320;

export function imageryFromMapCapture(capture: MapCaptureSettings, sourceId?: string): ImageryMetadata {
  return {
    provider: "google",
    sourceId,
    latitude: capture.latitude,
    longitude: capture.longitude,
    zoom: capture.zoom,
    imageWidthPx: capture.imageWidthPx,
    imageHeightPx: capture.imageHeightPx,
    widthM: capture.widthM,
    heightM: capture.heightM,
    metersPerPixelX: capture.widthM / capture.imageWidthPx,
    metersPerPixelY: capture.heightM / capture.imageHeightPx
  };
}

export function cadToImageryPixel(point: Point, imagery: ImageryMetadata): Point {
  return {
    x: (point.x / 1000 / imagery.widthM) * imagery.imageWidthPx,
    y: (point.y / 1000 / imagery.heightM) * imagery.imageHeightPx
  };
}

export function imageryPixelToCad(pixel: Point, imagery: ImageryMetadata): Point {
  return {
    x: (pixel.x / imagery.imageWidthPx) * imagery.widthM * 1000,
    y: (pixel.y / imagery.imageHeightPx) * imagery.heightM * 1000
  };
}

export function imageryPixelToLatLng(pixel: Point, imagery: ImageryMetadata) {
  const eastMeters = (pixel.x - imagery.imageWidthPx / 2) * imagery.metersPerPixelX;
  const southMeters = (pixel.y - imagery.imageHeightPx / 2) * imagery.metersPerPixelY;
  return {
    latitude: imagery.latitude - southMeters / EARTH_METERS_PER_DEGREE,
    longitude: imagery.longitude + eastMeters / longitudeMetersPerDegree(imagery.latitude)
  };
}

export function latLngToImageryPixel(latitude: number, longitude: number, imagery: ImageryMetadata): Point {
  const northMeters = (latitude - imagery.latitude) * EARTH_METERS_PER_DEGREE;
  const eastMeters = (longitude - imagery.longitude) * longitudeMetersPerDegree(imagery.latitude);
  return {
    x: imagery.imageWidthPx / 2 + eastMeters / imagery.metersPerPixelX,
    y: imagery.imageHeightPx / 2 - northMeters / imagery.metersPerPixelY
  };
}

export function applyScaleCalibration(imagery: ImageryMetadata, calibration: ScaleCalibration): ImageryMetadata {
  if (calibration.measuredDistanceMm <= 0 || calibration.knownDistanceM <= 0) return imagery;
  const measuredMeters = calibration.measuredDistanceMm / 1000;
  const scale = calibration.knownDistanceM / measuredMeters;
  return {
    ...imagery,
    widthM: imagery.widthM * scale,
    heightM: imagery.heightM * scale,
    metersPerPixelX: imagery.metersPerPixelX * scale,
    metersPerPixelY: imagery.metersPerPixelY * scale
  };
}

function longitudeMetersPerDegree(latitude: number) {
  return EARTH_METERS_PER_DEGREE * Math.max(0.1, Math.cos((latitude * Math.PI) / 180));
}
