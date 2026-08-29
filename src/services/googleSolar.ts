import { api } from "../api/client";
import type { MapCaptureSettings, SolarRegistration } from "../types/cad";
import { createSolarFluxCanvas } from "../cad/solar/solarHeatmap";
import { decodeAnnualFluxGeoTiff } from "../cad/solar/solarFlux";
import { createSolarGeoTransform, normalizeSolarRegistration } from "../cad/solar/solarGeoTransform";
import type { ProjectSolarDataState, SolarDebugLayerState, SolarLayerTransforms } from "../cad/solar/solarExposureTypes";
import { decodeNumericSolarGeoTiff, decodeRgbSolarGeoTiff, type SolarNumericRaster, type SolarRgbRaster } from "../cad/solar/solarRaster";

export const DEFAULT_SOLAR_DEBUG_LAYERS: SolarDebugLayerState = {
  googleSolarRgb: false,
  annualFlux: false,
  dsm: false,
  buildingMask: false,
  opacity: 0.5
};

export async function loadProjectSolarExposure(params: {
  workspaceId: string;
  projectId: string;
  mapCapture?: MapCaptureSettings;
  opacity: number;
  googleApiKey?: string;
  registration?: Partial<SolarRegistration>;
}): Promise<ProjectSolarDataState> {
  if (!params.mapCapture) {
    return {
      status: "error",
      visible: true,
      opacity: params.opacity,
      debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
      error: "Solar exposure needs a calibrated project map. Create the project with an installation address first."
    };
  }
  const dataLayers = await api.solarDataLayers(params.workspaceId, params.projectId, params.googleApiKey);
  if (!dataLayers.hasAnnualFlux) {
    return {
      status: "error",
      visible: true,
      opacity: params.opacity,
      debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
      dataLayers,
      error: "Annual solar exposure data is not available for this location."
    };
  }

  const annualBuffer = await api.solarAnnualFluxTiff(params.workspaceId, params.projectId, params.googleApiKey);
  const annualFlux = await decodeAnnualFluxGeoTiff(annualBuffer);
  const [rgb, dsm, mask] = await Promise.all([
    optionalRaster(dataLayers.hasRgb, () => api.solarLayerTiff(params.workspaceId, params.projectId, "rgb", params.googleApiKey).then(decodeRgbSolarGeoTiff)),
    optionalRaster(dataLayers.hasDsm, () => api.solarLayerTiff(params.workspaceId, params.projectId, "dsm", params.googleApiKey).then((buffer) => decodeNumericSolarGeoTiff(buffer, "dsm"))),
    optionalRaster(dataLayers.hasMask, () => api.solarLayerTiff(params.workspaceId, params.projectId, "mask", params.googleApiKey).then((buffer) => decodeNumericSolarGeoTiff(buffer, "mask")))
  ]);
  const registration = normalizeSolarRegistration(params.registration);
  const transforms = createTransforms(params.mapCapture, registration, { annualFlux, rgb, dsm, mask });

  return {
    status: "ready",
    visible: true,
    opacity: params.opacity,
    debugLayers: DEFAULT_SOLAR_DEBUG_LAYERS,
    registration,
    dataLayers,
    annualFlux,
    rgb,
    dsm,
    mask,
    transform: transforms.annualFlux,
    transforms,
    heatmapCanvas: createSolarFluxCanvas(annualFlux, params.opacity),
    dsmCanvas: dsm ? createGrayscaleCanvas(dsm) : undefined,
    maskCanvas: mask ? createMaskCanvas(mask) : undefined,
    loadedAt: new Date().toISOString()
  };
}

export function updateSolarExposureOpacity(state: ProjectSolarDataState, opacity: number): ProjectSolarDataState {
  if (!state.annualFlux) return { ...state, opacity };
  return {
    ...state,
    opacity,
    heatmapCanvas: createSolarFluxCanvas(state.annualFlux, opacity)
  };
}

export function updateSolarDebugLayers(state: ProjectSolarDataState, patch: Partial<SolarDebugLayerState>): ProjectSolarDataState {
  return {
    ...state,
    debugLayers: {
      ...DEFAULT_SOLAR_DEBUG_LAYERS,
      ...state.debugLayers,
      ...patch
    }
  };
}

export function applySolarRegistrationToState(
  state: ProjectSolarDataState,
  mapCapture: MapCaptureSettings | undefined,
  registrationInput: Partial<SolarRegistration>
): ProjectSolarDataState {
  const registration = normalizeSolarRegistration(registrationInput);
  if (state.status !== "ready" || !mapCapture || !state.annualFlux) return { ...state, registration };
  const transforms = createTransforms(mapCapture, registration, {
    annualFlux: state.annualFlux,
    rgb: state.rgb,
    dsm: state.dsm,
    mask: state.mask
  });
  return {
    ...state,
    registration,
    transform: transforms.annualFlux,
    transforms
  };
}

function createTransforms(
  mapCapture: MapCaptureSettings,
  registration: SolarRegistration,
  rasters: {
    annualFlux: SolarNumericRaster;
    rgb?: SolarRgbRaster;
    dsm?: SolarNumericRaster;
    mask?: SolarNumericRaster;
  }
): SolarLayerTransforms {
  return {
    annualFlux: createSolarGeoTransform(mapCapture, rasters.annualFlux, registration),
    rgb: rasters.rgb ? createSolarGeoTransform(mapCapture, rasters.rgb, registration) : undefined,
    dsm: rasters.dsm ? createSolarGeoTransform(mapCapture, rasters.dsm, registration) : undefined,
    mask: rasters.mask ? createSolarGeoTransform(mapCapture, rasters.mask, registration) : undefined
  };
}

async function optionalRaster<T>(enabled: boolean | undefined, loader: () => Promise<T>): Promise<T | undefined> {
  if (!enabled) return undefined;
  try {
    return await loader();
  } catch (error) {
    console.warn("Optional Google Solar debug raster failed to load", error);
    return undefined;
  }
}

function createGrayscaleCanvas(raster: SolarNumericRaster) {
  return createNumericCanvas(raster, (normalized) => {
    const value = Math.round(normalized * 255);
    return [value, value, value, 255];
  });
}

function createMaskCanvas(raster: SolarNumericRaster) {
  return createNumericCanvas(raster, (normalized) => {
    const value = normalized > 0.1 ? 255 : 0;
    return [14, 165, 233, value];
  });
}

function createNumericCanvas(raster: SolarNumericRaster, color: (normalized: number) => [number, number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const imageData = context.createImageData(raster.width, raster.height);
  const range = Math.max(1, raster.max - raster.min);
  for (let index = 0; index < raster.values.length; index += 1) {
    const value = raster.values[index];
    const offset = index * 4;
    if (!Number.isFinite(value) || value === raster.noDataValue) {
      imageData.data[offset + 3] = 0;
      continue;
    }
    const [r, g, b, a] = color(Math.max(0, Math.min(1, (value - raster.min) / range)));
    imageData.data[offset] = r;
    imageData.data[offset + 1] = g;
    imageData.data[offset + 2] = b;
    imageData.data[offset + 3] = a;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}
