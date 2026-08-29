import type { SolarDataLayers } from "../../api/types";
import type { SolarRegistration } from "../../types/cad";
import type { SolarFluxRaster } from "./solarFlux";
import type { SolarGeoTransform } from "./solarGeoTransform";
import type { SolarNumericRaster, SolarRgbRaster } from "./solarRaster";

export interface SolarDebugLayerState {
  googleSolarRgb: boolean;
  annualFlux: boolean;
  dsm: boolean;
  buildingMask: boolean;
  opacity: number;
}

export interface SolarLayerTransforms {
  annualFlux?: SolarGeoTransform;
  rgb?: SolarGeoTransform;
  dsm?: SolarGeoTransform;
  mask?: SolarGeoTransform;
}

export interface ProjectSolarDataState {
  status: "idle" | "loading" | "ready" | "error" | "stale";
  visible: boolean;
  opacity: number;
  debugLayers?: SolarDebugLayerState;
  registration?: SolarRegistration;
  dataLayers?: SolarDataLayers;
  annualFlux?: SolarFluxRaster;
  rgb?: SolarRgbRaster;
  dsm?: SolarNumericRaster;
  mask?: SolarNumericRaster;
  transform?: SolarGeoTransform;
  transforms?: SolarLayerTransforms;
  heatmapCanvas?: HTMLCanvasElement;
  dsmCanvas?: HTMLCanvasElement;
  maskCanvas?: HTMLCanvasElement;
  loadedAt?: string;
  error?: string;
}
