import * as geotiff from "geotiff";
import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";
import proj4 from "proj4";

export interface SolarFluxRaster {
  width: number;
  height: number;
  values: Float32Array;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  min: number;
  max: number;
  noDataValue?: number;
}

const DEFAULT_NO_DATA = -9999;

export async function decodeAnnualFluxGeoTiff(arrayBuffer: ArrayBuffer): Promise<SolarFluxRaster> {
  const tiff = await geotiff.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const firstBand = rasters[0] as ArrayLike<number>;
  const width = rasters.width;
  const height = rasters.height;
  const values = new Float32Array(width * height);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const noDataValue = Number(image.getGDALNoData() ?? DEFAULT_NO_DATA);

  for (let index = 0; index < values.length; index += 1) {
    const value = Number(firstBand[index]);
    values[index] = value;
    if (isValidSolarFlux(value, noDataValue)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error("Annual solar flux GeoTIFF did not contain valid pixels.");
  }

  return {
    width,
    height,
    values,
    bounds: await readLatLngBounds(image),
    min,
    max,
    noDataValue
  };
}

export function isValidSolarFlux(value: number, noDataValue = DEFAULT_NO_DATA) {
  return Number.isFinite(value) && value !== noDataValue && value > -1000;
}

export function sampleFluxAtPixel(raster: SolarFluxRaster, pixelX: number, pixelY: number) {
  const x = Math.floor(pixelX);
  const y = Math.floor(pixelY);
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
  const value = raster.values[y * raster.width + x];
  return isValidSolarFlux(value, raster.noDataValue) ? value : null;
}

async function readLatLngBounds(image: geotiff.GeoTIFFImage) {
  const rawBox = image.getBoundingBox();
  const geoKeys = image.getGeoKeys() ?? {};
  if (looksLikeLngLat(rawBox)) {
    return {
      west: rawBox[0],
      south: rawBox[1],
      east: rawBox[2],
      north: rawBox[3]
    };
  }

  const converter = geokeysToProj4.toProj4(geoKeys);
  const swSource = converter.convertCoordinates({ x: rawBox[0], y: rawBox[1], z: 0 });
  const neSource = converter.convertCoordinates({ x: rawBox[2], y: rawBox[3], z: 0 });
  const swPoint = proj4(converter.proj4, "WGS84", [swSource.x, swSource.y]) as [number, number];
  const nePoint = proj4(converter.proj4, "WGS84", [neSource.x, neSource.y]) as [number, number];
  const sw = { x: swPoint[0], y: swPoint[1] };
  const ne = { x: nePoint[0], y: nePoint[1] };
  return {
    west: Math.min(sw.x, ne.x),
    south: Math.min(sw.y, ne.y),
    east: Math.max(sw.x, ne.x),
    north: Math.max(sw.y, ne.y)
  };
}

function looksLikeLngLat(box: number[]) {
  return box[0] >= -180 && box[0] <= 180 && box[2] >= -180 && box[2] <= 180 && box[1] >= -90 && box[1] <= 90 && box[3] >= -90 && box[3] <= 90;
}
