import { api } from "../api/client";
import type { MapCaptureSettings } from "../types/cad";
import { createSolarFluxCanvas } from "../cad/solar/solarHeatmap";
import { decodeAnnualFluxGeoTiff } from "../cad/solar/solarFlux";
import { createSolarGeoTransform } from "../cad/solar/solarGeoTransform";
import type { ProjectSolarDataState } from "../cad/solar/solarExposureTypes";

export async function loadProjectSolarExposure(params: {
  workspaceId: string;
  projectId: string;
  mapCapture?: MapCaptureSettings;
  opacity: number;
  googleApiKey?: string;
}): Promise<ProjectSolarDataState> {
  if (!params.mapCapture) {
    return {
      status: "error",
      visible: true,
      opacity: params.opacity,
      error: "Solar exposure needs a calibrated project map. Create the project with an installation address first."
    };
  }
  const dataLayers = await api.solarDataLayers(params.workspaceId, params.projectId, params.googleApiKey);
  if (!dataLayers.hasAnnualFlux) {
    return {
      status: "error",
      visible: true,
      opacity: params.opacity,
      dataLayers,
      error: "Annual solar exposure data is not available for this location."
    };
  }
  const arrayBuffer = await api.solarAnnualFluxTiff(params.workspaceId, params.projectId, params.googleApiKey);
  const raster = await decodeAnnualFluxGeoTiff(arrayBuffer);
  const transform = createSolarGeoTransform(params.mapCapture, raster);
  const heatmapCanvas = createSolarFluxCanvas(raster, params.opacity);
  return {
    status: "ready",
    visible: true,
    opacity: params.opacity,
    dataLayers,
    annualFlux: raster,
    transform,
    heatmapCanvas,
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
