import { createSolarGeoTransform, normalizeSolarRegistration } from "../cad/solar/solarGeoTransform";
import type { ProjectSolarDataState, SolarDebugLayerState, SolarLayerTransforms } from "../cad/solar/solarExposureTypes";
import type { SolarNumericRaster, SolarRgbRaster } from "../cad/solar/solarRaster";
import type { MapCaptureSettings, SolarRegistration } from "../types/cad";

export const DEFAULT_SOLAR_DEBUG_LAYERS: SolarDebugLayerState = {
  googleSolarRgb: false,
  annualFlux: false,
  dsm: false,
  buildingMask: false,
  opacity: 0.5
};

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
