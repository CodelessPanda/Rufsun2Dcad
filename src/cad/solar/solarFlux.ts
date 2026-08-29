import {
  decodeNumericSolarGeoTiff,
  isValidSolarRasterValue,
  sampleNumericRasterAtPixel,
  type SolarNumericRaster
} from "./solarRaster";

export type SolarFluxRaster = SolarNumericRaster & { kind: "annualFlux" };

export async function decodeAnnualFluxGeoTiff(arrayBuffer: ArrayBuffer): Promise<SolarFluxRaster> {
  return decodeNumericSolarGeoTiff(arrayBuffer, "annualFlux") as Promise<SolarFluxRaster>;
}

export function isValidSolarFlux(value: number, noDataValue = -9999) {
  return isValidSolarRasterValue(value, noDataValue);
}

export function sampleFluxAtPixel(raster: SolarFluxRaster, pixelX: number, pixelY: number) {
  return sampleNumericRasterAtPixel(raster, pixelX, pixelY);
}
