import { describe, expect, it } from "vitest";
import type { RoofObject, SolarPanelObject, SubarrayConfig } from "../../types/cad";
import type { SolarModuleItem } from "../catalog/moduleCatalog";
import {
  calculateRowPitch,
  calculateSubarrayStats,
  generatePvLayout
} from "./pvLayoutEngine";
import type { ProjectSolarDataState } from "../solar/solarExposureTypes";
import type { SolarFluxRaster } from "../solar/solarFlux";
import type { SolarGeoTransform } from "../solar/solarGeoTransform";

const testModule: SolarModuleItem = {
  id: "test-mono-550",
  manufacturer: "Test Solar",
  model: "Mono 550W",
  wattage: 550,
  widthMM: 1000,
  heightMM: 2000,
  thicknessMM: 35,
  cellType: "mono-perc"
};

function makeTestRoof(widthMm = 12000, heightMm = 12000, setback = 500): RoofObject {
  return {
    id: "test-roof-1",
    type: "roof",
    x: 0,
    y: 0,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 1,
    name: "Main Roof",
    stroke: "#16855f",
    fill: "rgba(22, 133, 95, 0.13)",
    tilt: 15,
    azimuth: 0,
    heightM: 6,
    setback,
    points: [
      { x: 0, y: 0 },
      { x: widthMm, y: 0 },
      { x: widthMm, y: heightMm },
      { x: 0, y: heightMm }
    ]
  };
}

describe("Phase 9 PV Layout Engine & AutoDesigner", () => {
  describe("calculateRowPitch", () => {
    it("returns module height plus gap when tilt is zero", () => {
      const pitch = calculateRowPitch(2000, 0);
      expect(pitch).toBe(2020);
    });

    it("calculates shading pitch for tilted flat-roof racks", () => {
      // 2000mm module at 15 deg tilt, 22 deg winter sun elevation
      const pitch = calculateRowPitch(2000, 15, 22);
      // projected ~1931mm, rise ~517mm, shadow ~1281mm -> pitch ~3212mm
      expect(pitch).toBeGreaterThan(3000);
      expect(pitch).toBeLessThan(3500);
    });
  });

  describe("generatePvLayout - Sizing Modes", () => {
    it("max_fill mode places maximum panels inside usable roof area", () => {
      const roof = makeTestRoof(10000, 10000, 500);
      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "max_fill",
        orientation: "portrait",
        moduleGap: 20
      });

      expect(result.panels.length).toBeGreaterThan(10);
      expect(result.totalCapacityKwp).toBeGreaterThan(5);
      expect(result.summary.mode).toBe("max_fill");
      expect(result.summary.targetAchieved).toBe(result.panels.length);

      // Verify all panels are within bounds
      result.panels.forEach((panel) => {
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(10000);
        expect(panel.y + panel.height).toBeLessThanOrEqual(10000);
      });
    });

    it("target_capacity mode stops precisely once target kWp is met", () => {
      const roof = makeTestRoof(15000, 15000, 500);
      // Target: 5.0 kWp with 550W modules -> requires 10 modules = 5.5 kWp
      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "target_capacity",
        targetKwp: 5.0,
        orientation: "portrait"
      });

      expect(result.panels).toHaveLength(10);
      expect(result.totalCapacityKwp).toBe(5.5);
      expect(result.summary.targetRequested).toBe(5.0);
      expect(result.summary.targetAchieved).toBe(10);
    });

    it("target_count mode places exact requested number of modules", () => {
      const roof = makeTestRoof(15000, 15000, 500);
      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "target_count",
        targetCount: 14,
        orientation: "portrait"
      });

      expect(result.panels).toHaveLength(14);
      expect(result.totalWatts).toBe(14 * 550);
      expect(result.summary.targetAchieved).toBe(14);
    });

    it("landscape orientation swaps module width and height appropriately", () => {
      const roof = makeTestRoof(10000, 10000, 500);
      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "target_count",
        targetCount: 4,
        orientation: "landscape"
      });

      expect(result.panels).toHaveLength(4);
      expect(result.panels[0].width).toBe(testModule.heightMM); // 2000
      expect(result.panels[0].height).toBe(testModule.widthMM); // 1000
      expect(result.panels[0].orientation).toBe("landscape");
    });
  });

  describe("generatePvLayout - Service Walkway Corridors", () => {
    it("excludes candidate slots that overlap the designated walkway aisle", () => {
      const roof = makeTestRoof(10000, 10000, 500);

      // Without walkway
      const normalResult = generatePvLayout({
        roof,
        module: testModule,
        mode: "max_fill"
      });

      // With 1200mm vertical walkway corridor at center (x = ~5000)
      const walkwayResult = generatePvLayout({
        roof,
        module: testModule,
        mode: "max_fill",
        walkwayWidthMm: 1200,
        walkwayOrientation: "vertical"
      });

      expect(walkwayResult.panels.length).toBeLessThan(normalResult.panels.length);

      // Verify no panel occupies the central walkway zone [4400, 5600]
      walkwayResult.panels.forEach((p) => {
        const panelLeft = p.x;
        const panelRight = p.x + p.width;
        const overlapsCenterAisle = panelLeft < 5600 && panelRight > 4400;
        expect(overlapsCenterAisle).toBe(false);
      });
    });
  });

  describe("generatePvLayout - Irradiance Prioritization", () => {
    it("prioritizes slots with highest annual solar flux when solar exposure data is available", () => {
      const roof = makeTestRoof(10000, 10000, 500);

      // Mock Solar Exposure where right side (x > 5000) has high flux (1600) and left side has low flux (800)
      const mockRaster: SolarFluxRaster = {
        kind: "annualFlux",
        width: 10,
        height: 10,
        values: new Float32Array(100).map((_, i) => ((i % 10) >= 5 ? 1600 : 800)),
        min: 800,
        max: 1600,
        noDataValue: -9999,
        metadata: {} as SolarFluxRaster["metadata"],
        pixelToSourceCoordinate: (x, y) => ({ x, y }),
        sourceCoordinateToPixel: (x, y) => ({ x, y }),
        sourceCoordinateToLatLng: (x, y) => ({ latitude: y, longitude: x }),
        latLngToSourceCoordinate: (lat, lng) => ({ x: lng, y: lat })
      };

      const mockTransform = {
        worldToRasterPixel: (x: number, y: number) => ({ x: (x / 10000) * 10, y: (y / 10000) * 10 }),
        rasterPixelToWorld: (x: number, y: number) => ({ x: (x / 10) * 10000, y: (y / 10) * 10000 }),
        geoToRasterPixel: () => ({ x: 0, y: 0 }),
        rasterPixelToGeo: () => ({ latitude: 0, longitude: 0 }),
        geoToWorld: () => ({ x: 0, y: 0 }),
        worldToGeo: () => ({ latitude: 0, longitude: 0 })
      } as unknown as SolarGeoTransform;

      const solarExposure: ProjectSolarDataState = {
        status: "ready",
        visible: true,
        opacity: 1,
        annualFlux: mockRaster,
        transform: mockTransform
      };

      // Request 4 modules with best_irradiance prioritization
      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "target_count",
        targetCount: 4,
        prioritization: "best_irradiance",
        solarExposure
      });

      expect(result.panels).toHaveLength(4);
      // All 4 panels should be located in the high flux region (x >= 5000)
      result.panels.forEach((panel) => {
        expect(panel.x).toBeGreaterThanOrEqual(4500);
      });
    });
  });

  describe("Subarray Tagging & Aggregation", () => {
    it("tags generated panels with subarray metadata and aggregates stats accurately", () => {
      const roof = makeTestRoof(10000, 10000, 500);
      const subarrayId = "sub-south-roof";
      const subarrayName = "South Roof Main Array";

      const result = generatePvLayout({
        roof,
        module: testModule,
        mode: "target_count",
        targetCount: 8,
        subarrayId,
        subarrayName,
        rackingType: "tilted_rack",
        rackTiltDeg: 20
      });

      expect(result.panels).toHaveLength(8);
      expect(result.subarray).toBeDefined();
      expect(result.subarray?.id).toBe(subarrayId);
      expect(result.subarray?.name).toBe(subarrayName);
      expect(result.subarray?.rackingType).toBe("tilted_rack");
      expect(result.subarray?.rackTiltDeg).toBe(20);

      // Verify each panel has the subarray metadata
      result.panels.forEach((p) => {
        expect(p.subarrayId).toBe(subarrayId);
        expect(p.rackingType).toBe("tilted_rack");
        expect(p.rackTiltDeg).toBe(20);
      });

      // Test stats aggregation
      const subarrays: SubarrayConfig[] = [result.subarray!];
      const stats = calculateSubarrayStats(result.panels, subarrays);

      expect(stats).toHaveLength(1);
      expect(stats[0].subarrayId).toBe(subarrayId);
      expect(stats[0].moduleCount).toBe(8);
      expect(stats[0].totalWatts).toBe(8 * 550);
      expect(stats[0].totalKwp).toBe(4.4);
      expect(stats[0].rackingType).toBe("tilted_rack");
    });
  });
});
