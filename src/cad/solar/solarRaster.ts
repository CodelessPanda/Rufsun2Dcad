import * as geotiff from "geotiff";
import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";
import proj4 from "proj4";

export type SolarRasterKind = "annualFlux" | "rgb" | "dsm" | "mask";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface SolarRasterMetadata {
  width: number;
  height: number;
  sourceCrs: string;
  sourceCrsName?: string;
  sourceIsWgs84: boolean;
  bboxSource: [number, number, number, number];
  bboxWgs84: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  cornersSource: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
  cornersWgs84: {
    topLeft: LatLng;
    topRight: LatLng;
    bottomRight: LatLng;
    bottomLeft: LatLng;
  };
  pixelSize: {
    x: number;
    y: number;
  };
  warnings: string[];
}

export interface SolarRasterBase {
  kind: SolarRasterKind;
  width: number;
  height: number;
  metadata: SolarRasterMetadata;
  imageUrl?: string;
  pixelToSourceCoordinate: (x: number, y: number) => { x: number; y: number };
  sourceCoordinateToPixel: (x: number, y: number) => { x: number; y: number };
  sourceCoordinateToLatLng: (x: number, y: number) => LatLng;
  latLngToSourceCoordinate: (latitude: number, longitude: number) => { x: number; y: number };
}

export interface SolarNumericRaster extends SolarRasterBase {
  kind: "annualFlux" | "dsm" | "mask";
  values: Float32Array;
  min: number;
  max: number;
  noDataValue?: number;
}

export interface SolarRgbRaster extends SolarRasterBase {
  kind: "rgb";
  canvas: HTMLCanvasElement;
}

export type SolarRaster = SolarNumericRaster | SolarRgbRaster;

const DEFAULT_NO_DATA = -9999;
const WGS84 = "WGS84";

export async function decodeNumericSolarGeoTiff(arrayBuffer: ArrayBuffer, kind: SolarNumericRaster["kind"]): Promise<SolarNumericRaster> {
  const { image, rasters, base } = await readGeoTiffBase(arrayBuffer, kind);
  const firstBand = rasters[0] as ArrayLike<number>;
  const values = new Float32Array(base.width * base.height);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const noDataValue = Number(image.getGDALNoData() ?? DEFAULT_NO_DATA);

  for (let index = 0; index < values.length; index += 1) {
    const value = Number(firstBand[index]);
    values[index] = value;
    if (isValidSolarRasterValue(value, noDataValue)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`${kind} GeoTIFF did not contain valid pixels.`);
  }

  return {
    ...base,
    kind,
    values,
    min,
    max,
    noDataValue
  };
}

export async function decodeRgbSolarGeoTiff(arrayBuffer: ArrayBuffer): Promise<SolarRgbRaster> {
  const { rasters, base } = await readGeoTiffBase(arrayBuffer, "rgb");
  const red = rasters[0] as ArrayLike<number> | undefined;
  const green = rasters[1] as ArrayLike<number> | undefined;
  const blue = rasters[2] as ArrayLike<number> | undefined;
  if (!red || !green || !blue) throw new Error("Google Solar RGB GeoTIFF did not contain RGB bands.");

  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to render Google Solar RGB layer.");
  const imageData = context.createImageData(base.width, base.height);

  for (let index = 0; index < base.width * base.height; index += 1) {
    const offset = index * 4;
    imageData.data[offset] = clampByte(Number(red[index]));
    imageData.data[offset + 1] = clampByte(Number(green[index]));
    imageData.data[offset + 2] = clampByte(Number(blue[index]));
    imageData.data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return {
    ...base,
    kind: "rgb",
    canvas,
    imageUrl: canvas.toDataURL("image/jpeg", 0.82)
  };
}

export function createNumericSolarCanvas(raster: SolarNumericRaster, color: (value: number, min: number, max: number) => [number, number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const imageData = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.values.length; index += 1) {
    const value = raster.values[index];
    const offset = index * 4;
    if (!isValidSolarRasterValue(value, raster.noDataValue)) {
      imageData.data[offset + 3] = 0;
      continue;
    }
    const [r, g, b, a] = color(value, raster.min, raster.max);
    imageData.data[offset] = r;
    imageData.data[offset + 1] = g;
    imageData.data[offset + 2] = b;
    imageData.data[offset + 3] = a;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function sampleNumericRasterAtPixel(raster: SolarNumericRaster, pixelX: number, pixelY: number) {
  const x = Math.floor(pixelX);
  const y = Math.floor(pixelY);
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
  const value = raster.values[y * raster.width + x];
  return isValidSolarRasterValue(value, raster.noDataValue) ? value : null;
}

export function isValidSolarRasterValue(value: number, noDataValue = DEFAULT_NO_DATA) {
  return Number.isFinite(value) && value !== noDataValue && value > -1000;
}

async function readGeoTiffBase(arrayBuffer: ArrayBuffer, kind: SolarRasterKind) {
  const tiff = await geotiff.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const width = rasters.width;
  const height = rasters.height;
  const base = await createSolarRasterBase(kind, image, width, height);
  return { image, rasters, base };
}

async function createSolarRasterBase(kind: SolarRasterKind, image: geotiff.GeoTIFFImage, width: number, height: number): Promise<SolarRasterBase> {
  const warnings: string[] = [];
  const geoKeys = image.getGeoKeys() ?? {};
  const rawBox = readSourceBoundingBox(image, warnings);
  const affine = readAffine(image, warnings);
  const projection = createProjection(geoKeys, rawBox, warnings);

  const pixelToSourceCoordinate = (x: number, y: number) => ({
    x: affine.originX + x * affine.scaleX + y * affine.skewX,
    y: affine.originY + x * affine.skewY + y * affine.scaleY
  });
  const sourceCoordinateToPixel = (x: number, y: number) => invertAffinePixel(x, y, affine);
  const sourceCoordinateToLatLng = (x: number, y: number) => projectSourceToLatLng(x, y, projection);
  const latLngToSourceCoordinate = (latitude: number, longitude: number) => projectLatLngToSource(latitude, longitude, projection);

  const cornersSource = {
    topLeft: pixelToSourceCoordinate(0, 0),
    topRight: pixelToSourceCoordinate(width, 0),
    bottomRight: pixelToSourceCoordinate(width, height),
    bottomLeft: pixelToSourceCoordinate(0, height)
  };
  const cornersWgs84 = {
    topLeft: sourceCoordinateToLatLng(cornersSource.topLeft.x, cornersSource.topLeft.y),
    topRight: sourceCoordinateToLatLng(cornersSource.topRight.x, cornersSource.topRight.y),
    bottomRight: sourceCoordinateToLatLng(cornersSource.bottomRight.x, cornersSource.bottomRight.y),
    bottomLeft: sourceCoordinateToLatLng(cornersSource.bottomLeft.x, cornersSource.bottomLeft.y)
  };
  const bboxWgs84 = boundsFromLatLngs(Object.values(cornersWgs84));

  if (warnings.length > 0) {
    console.warn(`Solar raster diagnostics (${kind})`, warnings);
  }

  return {
    kind,
    width,
    height,
    metadata: {
      width,
      height,
      sourceCrs: projection.proj4,
      sourceCrsName: String(geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey ?? ""),
      sourceIsWgs84: projection.sourceIsWgs84,
      bboxSource: rawBox,
      bboxWgs84,
      cornersSource,
      cornersWgs84,
      pixelSize: { x: affine.scaleX, y: affine.scaleY },
      warnings
    },
    pixelToSourceCoordinate,
    sourceCoordinateToPixel,
    sourceCoordinateToLatLng,
    latLngToSourceCoordinate
  };
}

function readSourceBoundingBox(image: geotiff.GeoTIFFImage, warnings: string[]): [number, number, number, number] {
  try {
    const box = image.getBoundingBox();
    if (box.length === 4 && box.every(Number.isFinite)) return [box[0], box[1], box[2], box[3]];
  } catch (error) {
    warnings.push(`GeoTIFF bounding box could not be read: ${formatError(error)}`);
  }
  warnings.push("GeoTIFF bounding box is invalid; falling back to image-space bounds.");
  return [0, 0, image.getWidth(), image.getHeight()];
}

function readAffine(image: geotiff.GeoTIFFImage, warnings: string[]) {
  const directory = (image as unknown as { fileDirectory?: { ModelTransformation?: number[] } }).fileDirectory;
  const transform = directory?.ModelTransformation;
  if (Array.isArray(transform) && transform.length >= 16) {
    return {
      originX: transform[3],
      originY: transform[7],
      scaleX: transform[0],
      skewX: transform[1],
      skewY: transform[4],
      scaleY: transform[5]
    };
  }

  try {
    const [originX, originY] = image.getOrigin();
    const [scaleX, scaleY] = image.getResolution();
    return { originX, originY, scaleX, scaleY, skewX: 0, skewY: 0 };
  } catch (error) {
    warnings.push(`GeoTIFF affine transform could not be read: ${formatError(error)}`);
    return { originX: 0, originY: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
  }
}

function invertAffinePixel(x: number, y: number, affine: ReturnType<typeof readAffine>) {
  const dx = x - affine.originX;
  const dy = y - affine.originY;
  const determinant = affine.scaleX * affine.scaleY - affine.skewX * affine.skewY;
  if (Math.abs(determinant) < 1e-12) return { x: Number.NaN, y: Number.NaN };
  return {
    x: (dx * affine.scaleY - affine.skewX * dy) / determinant,
    y: (affine.scaleX * dy - dx * affine.skewY) / determinant
  };
}

function createProjection(geoKeys: Record<string, unknown>, rawBox: [number, number, number, number], warnings: string[]) {
  if (looksLikeLngLat(rawBox)) {
    return {
      proj4: WGS84,
      sourceIsWgs84: true,
      convertCoordinates: (point: { x: number; y: number }) => ({ x: point.x, y: point.y, z: 0 }),
      unconvertCoordinates: (point: { x: number; y: number }) => ({ x: point.x, y: point.y })
    };
  }

  try {
    const converter = geokeysToProj4.toProj4(geoKeys as geokeysToProj4.GeoKeys);
    Object.entries(converter.errors ?? {}).forEach(([key, value]) => {
      warnings.push(`GeoKey conversion warning ${key}: ${String(value)}`);
    });
    return {
      proj4: converter.proj4,
      sourceIsWgs84: converter.isGCS && converter.proj4 === WGS84,
      convertCoordinates: converter.convertCoordinates,
      unconvertCoordinates: (point: { x: number; y: number }) => ({
        x: point.x / converter.conversionParameters.x,
        y: point.y / converter.conversionParameters.y
      })
    };
  } catch (error) {
    warnings.push(`GeoKeys could not be converted to Proj4: ${formatError(error)}`);
    return {
      proj4: WGS84,
      sourceIsWgs84: true,
      convertCoordinates: (point: { x: number; y: number }) => ({ x: point.x, y: point.y, z: 0 }),
      unconvertCoordinates: (point: { x: number; y: number }) => ({ x: point.x, y: point.y })
    };
  }
}

function projectSourceToLatLng(x: number, y: number, projection: ReturnType<typeof createProjection>): LatLng {
  if (projection.sourceIsWgs84) return { latitude: y, longitude: x };
  const converted = projection.convertCoordinates({ x, y, z: 0 });
  const [longitude, latitude] = proj4(projection.proj4, WGS84, [converted.x, converted.y]) as [number, number];
  return { latitude, longitude };
}

function projectLatLngToSource(latitude: number, longitude: number, projection: ReturnType<typeof createProjection>) {
  if (projection.sourceIsWgs84) return { x: longitude, y: latitude };
  const [x, y] = proj4(WGS84, projection.proj4, [longitude, latitude]) as [number, number];
  return projection.unconvertCoordinates({ x, y });
}

function boundsFromLatLngs(points: LatLng[]) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes)
  };
}

function looksLikeLngLat(box: number[]) {
  return box[0] >= -180 && box[0] <= 180 && box[2] >= -180 && box[2] <= 180 && box[1] >= -90 && box[1] <= 90 && box[3] >= -90 && box[3] <= 90;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
