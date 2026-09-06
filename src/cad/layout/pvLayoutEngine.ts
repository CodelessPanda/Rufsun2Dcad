import { v4 as uuid } from "uuid";
import type {
  ObstructionObject,
  Point,
  RestrictedZoneObject,
  RoofObject,
  SolarPanelObject,
  SubarrayConfig,
  SubarrayRackingType
} from "../../types/cad";
import type { SolarModuleItem } from "../catalog/moduleCatalog";
import type { SolarModuleCatalogItem } from "../../data/sampleSolarModules";
import {
  getBoundingBox,
  polygonArea,
  polygonContainsPolygon,
  roofUsablePolygon,
  rotatePoint,
  validatePanelPlacement
} from "../geometry/geometry";
import { createSolarPanel } from "../objects/factory";
import type { ProjectSolarDataState } from "../solar/solarExposureTypes";

export type AutoDesignerMode = "max_fill" | "target_capacity" | "target_count";
export type LayoutPrioritization = "standard_grid" | "best_irradiance";

export interface GeneratePvLayoutOptions {
  roof: RoofObject;
  module: SolarModuleItem | SolarModuleCatalogItem;
  mode?: AutoDesignerMode;
  targetKwp?: number;
  targetCount?: number;
  orientation?: "portrait" | "landscape";
  moduleGap?: number;
  rowPitchMm?: number;
  walkwayWidthMm?: number;
  walkwayOrientation?: "vertical" | "horizontal";
  walkwayPositionPercent?: number; // 0 to 1, default 0.5 (center)
  prioritization?: LayoutPrioritization;
  solarExposure?: ProjectSolarDataState;
  subarrayId?: string;
  subarrayName?: string;
  rackingType?: SubarrayRackingType;
  rackTiltDeg?: number;
  layerId?: string;
  zIndexStart?: number;
  existingPanels?: SolarPanelObject[];
  obstructions?: ObstructionObject[];
  restrictedZones?: RestrictedZoneObject[];
  clearanceMm?: number;
}

export interface SubarraySummary {
  subarrayId: string;
  name: string;
  moduleCount: number;
  totalWatts: number;
  totalKwp: number;
  rackingType?: SubarrayRackingType;
  rackTiltDeg?: number;
}

export interface GeneratePvLayoutResult {
  panels: SolarPanelObject[];
  skippedCount: number;
  totalCapacityKwp: number;
  totalWatts: number;
  subarray?: SubarrayConfig;
  summary: {
    targetRequested?: number;
    targetAchieved: number;
    averageFlux?: number;
    mode: AutoDesignerMode;
    orientation: "portrait" | "landscape";
  };
}

/**
 * Calculates row pitch (center-to-center row spacing) for tilted panels on a flat surface
 * to prevent inter-row shading during the lowest sun angle (e.g. winter solstice).
 */
export function calculateRowPitch(
  moduleHeightMm: number,
  rackTiltDeg: number,
  minSunElevationDeg = 22
): number {
  if (rackTiltDeg <= 0) return moduleHeightMm + 20;
  const tiltRad = (rackTiltDeg * Math.PI) / 180;
  const sunRad = (Math.max(10, Math.min(80, minSunElevationDeg)) * Math.PI) / 180;
  const projectedLength = moduleHeightMm * Math.cos(tiltRad);
  const verticalRise = moduleHeightMm * Math.sin(tiltRad);
  const shadowLength = verticalRise / Math.tan(sunRad);
  return Math.round(projectedLength + shadowLength);
}

/**
 * Generates an optimized photovoltaic layout on a roof face supporting:
 * - Max Fill, Target Capacity (kWp), or Target Module Count
 * - Irradiance / solar flux ranking (places on sunniest slots first)
 * - Service / fire access walkways
 * - Flat roof tilt-rack row pitch calculation
 * - Subarray grouping & racking metadata tagging
 */
export function generatePvLayout(options: GeneratePvLayoutOptions): GeneratePvLayoutResult {
  const {
    roof,
    module,
    mode = "max_fill",
    targetKwp,
    targetCount,
    orientation = "portrait",
    moduleGap = 20,
    clearanceMm = 25.4,
    walkwayWidthMm = 0,
    walkwayOrientation = "vertical",
    walkwayPositionPercent = 0.5,
    prioritization = "standard_grid",
    solarExposure,
    rackingType = "flush",
    rackTiltDeg,
    layerId = "solar",
    zIndexStart = 1,
    existingPanels = [],
    obstructions = [],
    restrictedZones = []
  } = options;

  // 1. Determine module target count limit
  let maxAllowedModules = Infinity;
  let targetRequested: number | undefined;

  if (mode === "target_capacity" && typeof targetKwp === "number" && targetKwp > 0) {
    targetRequested = targetKwp;
    maxAllowedModules = Math.max(1, Math.ceil((targetKwp * 1000) / module.wattage));
  } else if (mode === "target_count" && typeof targetCount === "number" && targetCount > 0) {
    targetRequested = targetCount;
    maxAllowedModules = Math.max(1, Math.round(targetCount));
  }

  // 2. Prepare Subarray Configuration
  const effectiveSubarrayId = options.subarrayId || `subarray-${Date.now()}`;
  const subarrayConfig: SubarrayConfig = {
    id: effectiveSubarrayId,
    name: options.subarrayName || `${roof.name || "Roof"} Array`,
    roofId: roof.id,
    rackingType,
    rackTiltDeg: rackingType === "tilted_rack" || rackingType === "ballasted" ? rackTiltDeg : undefined
  };

  // 3. Transform usable roof polygon to local coordinate space aligned with roof azimuth
  const usableRoofPoints = roofUsablePolygon(roof, clearanceMm);
  if (usableRoofPoints.length < 3) {
    return emptyResult(mode, orientation, subarrayConfig, targetRequested);
  }

  const roofBox = getBoundingBox(roof);
  const origin = { x: roofBox.x + roofBox.width / 2, y: roofBox.y + roofBox.height / 2 };
  const localRoofPoints = usableRoofPoints.map((pt) => rotatePoint(pt, origin, -roof.azimuth));
  const localBounds = boundsFromPoints(localRoofPoints);

  const modWidth = orientation === "portrait" ? module.widthMM : module.heightMM;
  const modHeight = orientation === "portrait" ? module.heightMM : module.widthMM;

  // Row spacing: check if rack tilt row pitch applies
  const effectiveRowStep =
    options.rowPitchMm && options.rowPitchMm > modHeight
      ? options.rowPitchMm
      : rackingType === "tilted_rack" && typeof rackTiltDeg === "number" && rackTiltDeg > 0
      ? calculateRowPitch(modHeight, rackTiltDeg)
      : modHeight + moduleGap;

  const effectiveColStep = modWidth + moduleGap;

  const startX = localBounds.x;
  const startY = localBounds.y;
  const maxX = localBounds.x + localBounds.width - modWidth;
  const maxY = localBounds.y + localBounds.height - modHeight;

  if (maxX < startX || maxY < startY) {
    return emptyResult(mode, orientation, subarrayConfig, targetRequested);
  }

  // 4. Calculate Walkway corridor in local space if requested
  const hasWalkway = walkwayWidthMm > 0;
  let walkwayMin = -Infinity;
  let walkwayMax = -Infinity;
  if (hasWalkway) {
    const clampedPercent = Math.max(0.1, Math.min(0.9, walkwayPositionPercent));
    if (walkwayOrientation === "vertical") {
      const center = localBounds.x + localBounds.width * clampedPercent;
      walkwayMin = center - walkwayWidthMm / 2;
      walkwayMax = center + walkwayWidthMm / 2;
    } else {
      const center = localBounds.y + localBounds.height * clampedPercent;
      walkwayMin = center - walkwayWidthMm / 2;
      walkwayMax = center + walkwayWidthMm / 2;
    }
  }

  // 5. Generate Candidate Slots
  const rowLimit = Math.min(200, Math.floor((localBounds.height + effectiveRowStep) / effectiveRowStep) + 2);
  const colLimit = Math.min(200, Math.floor((localBounds.width + effectiveColStep) / effectiveColStep) + 2);

  interface CandidateSlot {
    panel: SolarPanelObject;
    fluxValue: number;
    col: number;
    row: number;
  }

  const candidates: CandidateSlot[] = [];
  let skippedCount = 0;

  for (let row = 0; row < rowLimit; row += 1) {
    const y = startY + row * effectiveRowStep;
    if (y > maxY) break;

    // Check horizontal walkway exclusion
    if (hasWalkway && walkwayOrientation === "horizontal") {
      if (y + modHeight > walkwayMin && y < walkwayMax) {
        skippedCount += colLimit;
        continue;
      }
    }

    for (let col = 0; col < colLimit; col += 1) {
      const x = startX + col * effectiveColStep;
      if (x > maxX) break;

      // Check vertical walkway exclusion
      if (hasWalkway && walkwayOrientation === "vertical") {
        if (x + modWidth > walkwayMin && x < walkwayMax) {
          skippedCount += 1;
          continue;
        }
      }

      // Check module local footprint containment inside local usable roof
      const localFootprint = [
        { x, y },
        { x: x + modWidth, y },
        { x: x + modWidth, y: y + modHeight },
        { x, y: y + modHeight }
      ];

      if (!polygonContainsPolygon(localRoofPoints, localFootprint)) {
        skippedCount += 1;
        continue;
      }

      // Transform top-left back to world coordinates
      const worldTopLeft = rotatePoint({ x, y }, origin, roof.azimuth);
      const panel = createSolarPanel(
        worldTopLeft,
        module,
        layerId,
        zIndexStart + candidates.length,
        orientation,
        effectiveSubarrayId,
        rackingType,
        rackingType === "tilted_rack" ? rackTiltDeg : undefined
      );
      panel.moduleGap = moduleGap;
      panel.rotation = roof.azimuth;

      // Validate panel against obstructions, restricted zones, and other existing panels
      const validation = validatePanelPlacement(panel, {
        roofs: [roof],
        existingPanels,
        obstructions,
        restrictedZones,
        clearanceMm
      });

      if (!validation.valid) {
        skippedCount += 1;
        continue;
      }

      // Calculate annual flux value for this panel position if available
      let fluxValue = 1000;
      if (solarExposure?.status === "ready" && solarExposure.annualFlux && solarExposure.transform) {
        fluxValue = sampleRasterFluxAtPoint(worldTopLeft, solarExposure.annualFlux, solarExposure.transform);
      }

      candidates.push({ panel, fluxValue, col, row });
    }
  }

  // 6. Apply Prioritization
  if (prioritization === "best_irradiance" && candidates.length > 0) {
    // Sort descending by solar irradiance (most productive slots first)
    candidates.sort((a, b) => b.fluxValue - a.fluxValue);
  }

  // 7. Select up to maxAllowedModules
  const selectedCandidates = candidates.slice(0, maxAllowedModules);
  const finalPanels: SolarPanelObject[] = [];

  // Second-pass validation to ensure newly placed panels don't overlap each other
  // (relevant when candidate grid uses irregular spacing or irradiance sorting)
  for (const candidate of selectedCandidates) {
    const validation = validatePanelPlacement(candidate.panel, {
      roofs: [roof],
      existingPanels: [...existingPanels, ...finalPanels],
      obstructions,
      restrictedZones,
      clearanceMm
    });
    if (validation.valid) {
      candidate.panel.id = uuid();
      candidate.panel.zIndex = zIndexStart + finalPanels.length;
      finalPanels.push(candidate.panel);
    } else {
      skippedCount += 1;
    }
  }

  const totalWatts = finalPanels.reduce((sum, p) => sum + p.wattage, 0);
  const totalCapacityKwp = Math.round((totalWatts / 1000) * 100) / 100;
  const avgFlux =
    selectedCandidates.length > 0
      ? Math.round(selectedCandidates.reduce((sum, c) => sum + c.fluxValue, 0) / selectedCandidates.length)
      : undefined;

  return {
    panels: finalPanels,
    skippedCount,
    totalCapacityKwp,
    totalWatts,
    subarray: finalPanels.length > 0 ? subarrayConfig : undefined,
    summary: {
      targetRequested,
      targetAchieved: finalPanels.length,
      averageFlux: avgFlux,
      mode,
      orientation
    }
  };
}

/**
 * Aggregates statistics for all subarrays present in a document
 */
export function calculateSubarrayStats(
  panels: SolarPanelObject[],
  subarrays?: SubarrayConfig[]
): SubarraySummary[] {
  const map = new Map<string, { count: number; watts: number; rackingType?: SubarrayRackingType; rackTiltDeg?: number }>();

  panels.forEach((panel) => {
    const key = panel.subarrayId || "default";
    const existing = map.get(key) || { count: 0, watts: 0, rackingType: panel.rackingType, rackTiltDeg: panel.rackTiltDeg };
    map.set(key, {
      count: existing.count + 1,
      watts: existing.watts + panel.wattage,
      rackingType: panel.rackingType ?? existing.rackingType,
      rackTiltDeg: panel.rackTiltDeg ?? existing.rackTiltDeg
    });
  });

  const subarrayConfigsById = new Map((subarrays || []).map((s) => [s.id, s]));
  const results: SubarraySummary[] = [];

  map.forEach((data, subarrayId) => {
    const config = subarrayConfigsById.get(subarrayId);
    results.push({
      subarrayId,
      name: config?.name || (subarrayId === "default" ? "Unassigned Array" : "Subarray"),
      moduleCount: data.count,
      totalWatts: data.watts,
      totalKwp: Math.round((data.watts / 1000) * 100) / 100,
      rackingType: config?.rackingType ?? data.rackingType,
      rackTiltDeg: config?.rackTiltDeg ?? data.rackTiltDeg
    });
  });

  return results.sort((a, b) => b.totalWatts - a.totalWatts);
}

function emptyResult(
  mode: AutoDesignerMode,
  orientation: "portrait" | "landscape",
  subarrayConfig: SubarrayConfig,
  targetRequested?: number
): GeneratePvLayoutResult {
  return {
    panels: [],
    skippedCount: 0,
    totalCapacityKwp: 0,
    totalWatts: 0,
    subarray: subarrayConfig,
    summary: {
      targetRequested,
      targetAchieved: 0,
      mode,
      orientation
    }
  };
}

function boundsFromPoints(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY
  };
}

function sampleRasterFluxAtPoint(
  point: Point,
  annualFlux: NonNullable<ProjectSolarDataState["annualFlux"]>,
  transform: NonNullable<ProjectSolarDataState["transform"]>
): number {
  try {
    const pixel = transform.worldToRasterPixel(point.x, point.y);
    const px = Math.floor(pixel.x);
    const py = Math.floor(pixel.y);
    if (px >= 0 && px < annualFlux.width && py >= 0 && py < annualFlux.height) {
      const idx = py * annualFlux.width + px;
      const val = annualFlux.values[idx];
      if (val !== annualFlux.noDataValue && !Number.isNaN(val) && val > 0) {
        return Math.round(val);
      }
    }
  } catch {
    // Fallback if coordinate transform fails
  }
  return 1000;
}
