import { describe, expect, it } from "vitest";
import type { RoofObject, RufsunCadDocument, SolarPanelObject } from "../../types/cad";
import { calculateSiteSummary, ensureSiteModel } from "./siteModel";
import { roofContainsPanel, roofUsablePolygons, validatePolygon } from "../geometry/geometry";
import { buildRoofAnnualFluxMap } from "../solar/solarAnalysis";
import type { SolarFluxRaster } from "../solar/solarFlux";
import type { SolarGeoTransform } from "../solar/solarGeoTransform";

describe("Phase 8 site model", () => {
  it("keeps one structure with multiple roof faces loadable", () => {
    const doc = makeDocument([makeRoof("roof-a", "structure-main"), makeRoof("roof-b", "structure-main", 3000)]);
    doc.site = {
      northRotation: 0,
      structures: [{ id: "structure-main", name: "Main House", roofFaceIds: ["roof-a", "roof-b"], buildingType: "house" }]
    };

    const normalized = ensureSiteModel(doc);

    expect(normalized.site?.structures).toHaveLength(1);
    expect(normalized.site?.structures[0].roofFaceIds).toEqual(["roof-a", "roof-b"]);
    expect(normalized.objects.filter((object) => object.type === "roof").every((roof) => roof.structureId === "structure-main")).toBe(true);
  });

  it("supports two structures while aggregating project totals", () => {
    const doc = makeDocument([makeRoof("roof-a", "structure-house"), makeRoof("roof-b", "structure-garage", 3000)], [makePanel("panel-a"), makePanel("panel-b", 3500)]);
    doc.site = {
      northRotation: 0,
      structures: [
        { id: "structure-house", name: "Main House", roofFaceIds: ["roof-a"], buildingType: "house" },
        { id: "structure-garage", name: "Garage", roofFaceIds: ["roof-b"], buildingType: "garage" }
      ]
    };

    const summary = calculateSiteSummary(doc);

    expect(summary.structureCount).toBe(2);
    expect(summary.roofFaceCount).toBe(2);
    expect(summary.panelCount).toBe(2);
    expect(summary.systemCapacityKwp).toBe(1.1);
  });

  it("produces valid usable geometry with per-edge setbacks", () => {
    const roof = makeRoof("roof-a", "structure-main");
    roof.edgeMetadata = [
      { id: "edge-a", index: 0, classification: "RIDGE", setback: 700 },
      { id: "edge-b", index: 1, classification: "EAVE", setback: 300 },
      { id: "edge-c", index: 2, classification: "RAKE", setback: 450 },
      { id: "edge-d", index: 3, classification: "RAKE", setback: 450 }
    ];

    const usable = roofUsablePolygons(roof);

    expect(usable.length).toBeGreaterThan(0);
    expect(validatePolygon(usable[0]).valid).toBe(true);
    expect(usable[0][0].y).toBeGreaterThanOrEqual(699);
  });

  it("loads legacy roof documents into a default structure", () => {
    const legacy = makeDocument([makeRoof("legacy-roof")]);
    delete legacy.site;
    legacy.objects = legacy.objects.map((object) => object.type === "roof" ? { ...object, structureId: undefined, edgeMetadata: undefined, pitch: undefined } : object);

    const normalized = ensureSiteModel(legacy);

    expect(normalized.site?.structures).toHaveLength(1);
    expect(normalized.site?.structures[0].roofFaceIds).toEqual(["legacy-roof"]);
    expect((normalized.objects[0] as RoofObject).structureId).toBe(normalized.site?.structures[0].id);
  });

  it("keeps solar irradiance associated with roof-face geometry", () => {
    const roof = makeRoof("roof-a", "structure-main");
    const values = buildRoofAnnualFluxMap([roof], {
      status: "ready",
      visible: true,
      opacity: 1,
      annualFlux: raster(),
      transform: transform()
    });

    expect(values?.["roof-a"]).toBe(1200);
  });

  it("keeps existing panel placement valid on roof faces", () => {
    const roof = makeRoof("roof-a", "structure-main");
    const panel = makePanel("panel-a");

    expect(roofContainsPanel(panel, [roof])).toBe(true);
  });
});

function makeDocument(roofs: RoofObject[], panels: SolarPanelObject[] = []): RufsunCadDocument {
  const now = new Date().toISOString();
  return {
    rufsunCadVersion: "0.2",
    version: "0.2",
    name: "Phase 8 Test",
    units: "mm",
    objects: [...roofs, ...panels],
    layers: [],
    settings: {
      activeLayerId: "roof",
      grid: { visible: true, minor: 100, major: 500 },
      snap: { enabled: true, grid: true, endpoints: true, midpoints: true, centers: true, edges: true, alignment: true, tolerancePx: 12 }
    },
    createdAt: now,
    updatedAt: now
  };
}

function makeRoof(id: string, structureId?: string, xOffset = 0): RoofObject {
  return {
    id,
    type: "roof",
    x: xOffset,
    y: 0,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 1,
    name: id,
    structureId,
    points: [
      { x: xOffset, y: 0 },
      { x: xOffset + 2500, y: 0 },
      { x: xOffset + 2500, y: 2500 },
      { x: xOffset, y: 2500 }
    ],
    stroke: "#16855f",
    fill: "rgba(22, 133, 95, 0.13)",
    tilt: 15,
    azimuth: 180,
    heightM: 6,
    setback: 300
  };
}

function makePanel(id: string, x = 700): SolarPanelObject {
  return {
    id,
    type: "solarPanel",
    x,
    y: 700,
    rotation: 0,
    layerId: "solar",
    visible: true,
    locked: false,
    zIndex: 2,
    manufacturer: "Test",
    model: "Module",
    width: 800,
    height: 800,
    thickness: 35,
    wattage: 550,
    orientation: "portrait",
    moduleGap: 20
  };
}

function raster(): SolarFluxRaster {
  return {
    kind: "annualFlux",
    width: 2,
    height: 2,
    values: new Float32Array([1000, 1200, 1200, 1400]),
    min: 1000,
    max: 1400,
    noDataValue: -9999,
    metadata: {} as SolarFluxRaster["metadata"],
    pixelToSourceCoordinate: (x, y) => ({ x, y }),
    sourceCoordinateToPixel: (x, y) => ({ x, y }),
    sourceCoordinateToLatLng: (x, y) => ({ latitude: y, longitude: x }),
    latLngToSourceCoordinate: (latitude, longitude) => ({ x: longitude, y: latitude })
  };
}

function transform(): SolarGeoTransform {
  return {
    worldToRasterPixel: (x, y) => ({ x: x / 1250, y: y / 1250 })
  } as SolarGeoTransform;
}
