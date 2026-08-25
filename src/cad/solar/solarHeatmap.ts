import type { SolarFluxRaster } from "./solarFlux";
import { isValidSolarFlux } from "./solarFlux";
import { getSolarFluxColor } from "./solarPalette";

export function createSolarFluxCanvas(raster: SolarFluxRaster, opacity: number) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const imageData = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.values.length; index += 1) {
    const value = raster.values[index];
    const offset = index * 4;
    if (!isValidSolarFlux(value, raster.noDataValue)) {
      imageData.data[offset + 3] = 0;
      continue;
    }
    const [r, g, b, a] = getSolarFluxColor(value, raster.min, raster.max, 1);
    imageData.data[offset] = r;
    imageData.data[offset + 1] = g;
    imageData.data[offset + 2] = b;
    imageData.data[offset + 3] = a;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}
