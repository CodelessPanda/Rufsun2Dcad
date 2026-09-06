/**
 * Lightweight in-memory cache for the solar flux raster.
 *
 * The raster is normally held inside `ProjectSolarDataState` (the visual
 * overlay).  This cache decouples energy-calculation accuracy from whether the
 * user has toggled the solar heatmap layer — the energy panel can populate
 * the cache eagerly by calling `loadFluxOnly()` without loading the full
 * visual stack (RGB / DSM / mask).
 */

import type { SolarFluxRaster } from "./solarFlux";
import type { SolarGeoTransform } from "./solarGeoTransform";

export interface SolarFluxCacheEntry {
  raster: SolarFluxRaster;
  transform: SolarGeoTransform;
  loadedAt: string;
}

// Module-level cache keyed by projectId
const cache = new Map<string, SolarFluxCacheEntry>();

/**
 * Store a decoded raster + transform for a given project.
 * Called automatically by `loadProjectSolarExposure()` and `loadFluxOnly()`.
 */
export function setFluxCache(projectId: string, raster: SolarFluxRaster, transform: SolarGeoTransform): void {
  cache.set(projectId, { raster, transform, loadedAt: new Date().toISOString() });
}

/**
 * Retrieve the cached flux raster for a project, or `undefined` if not yet loaded.
 */
export function getFluxCache(projectId: string): SolarFluxCacheEntry | undefined {
  return cache.get(projectId);
}

/**
 * Evict the cached entry for a project (e.g. when the project changes or the
 * user loads a new address).
 */
export function clearFluxCache(projectId: string): void {
  cache.delete(projectId);
}

/**
 * Check whether flux data is already cached for a given project.
 */
export function hasFluxCache(projectId: string): boolean {
  return cache.has(projectId);
}
