import type { SolarDataLayers } from "../../api/types";
import type { SolarFluxRaster } from "./solarFlux";
import type { SolarGeoTransform } from "./solarGeoTransform";

export interface ProjectSolarDataState {
  status: "idle" | "loading" | "ready" | "error" | "stale";
  visible: boolean;
  opacity: number;
  dataLayers?: SolarDataLayers;
  annualFlux?: SolarFluxRaster;
  transform?: SolarGeoTransform;
  heatmapCanvas?: HTMLCanvasElement;
  loadedAt?: string;
  error?: string;
}
