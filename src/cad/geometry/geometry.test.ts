import { describe, expect, it } from "vitest";
import type { ObstructionObject, RestrictedZoneObject, RoofObject, SolarPanelObject } from "../../types/cad";
import { polygonArea, roofContainsPanel, roofUsablePolygon, validatePanelPlacement, validatePolygon } from "./geometry";

describe("roofContainsPanel", () => {
  it("requires panels to stay inside the setback line with one inch of clearance", () => {
    const roof = makeRoof();
    const safePanel = makePanel("safe", 700, 700);
    const crossingSetbackPanel = makePanel("crossing", 330, 700);

    expect(roofContainsPanel(safePanel, [roof])).toBe(true);
    expect(roofContainsPanel(crossingSetbackPanel, [roof])).toBe(false);
  });

  it("uses the same top-left rotation origin as the canvas renderer", () => {
    const roof = makeRoof(0);
    const panel = makePanel("rotated", 10, 2500, 90);

    expect(roofContainsPanel(panel, [roof], 0)).toBe(false);
  });

  it("creates usable geometry for a concave roof setback", () => {
    const roof = makeRoof(300, [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 2000 },
      { x: 3000, y: 2000 },
      { x: 3000, y: 5000 },
      { x: 0, y: 5000 }
    ]);
    const usable = roofUsablePolygon(roof);

    expect(validatePolygon(roof.points).valid).toBe(true);
    expect(usable.length).toBeGreaterThanOrEqual(3);
    expect(polygonArea(usable)).toBeGreaterThan(0);
    expect(polygonArea(usable)).toBeLessThan(polygonArea(roof.points));
  });

  it("reports setback violations separately from gross roof violations", () => {
    const roof = makeRoof(500);
    const panel = makePanel("setback", 100, 100);

    const result = validatePanelPlacement(panel, { roofs: [roof], clearanceMm: 25.4 });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("SETBACK_VIOLATION");
    expect(result.reasons).not.toContain("OUTSIDE_ROOF");
  });

  it("reports obstruction clearance collisions", () => {
    const roof = makeRoof(0);
    const panel = makePanel("panel", 1700, 1700);
    const obstruction = makeObstruction();

    const result = validatePanelPlacement(panel, { roofs: [roof], obstructions: [obstruction] });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("OBSTRUCTION_COLLISION");
  });

  it("reports restricted zone collisions", () => {
    const roof = makeRoof(0);
    const panel = makePanel("panel", 1700, 1700);
    const restrictedZone = makeRestrictedZone();

    const result = validatePanelPlacement(panel, { roofs: [roof], restrictedZones: [restrictedZone] });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("RESTRICTED_ZONE");
  });
});

function makeRoof(setback = 500, points = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 5000 },
  { x: 0, y: 5000 }
]): RoofObject {
  return {
    id: "roof-a",
    type: "roof",
    x: 0,
    y: 0,
    points,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 1,
    name: "Roof A",
    stroke: "#16855f",
    fill: "rgba(22, 133, 95, 0.13)",
    tilt: 15,
    azimuth: 180,
    heightM: 10,
    setback
  };
}

function makeObstruction(): ObstructionObject {
  return {
    id: "obstruction-a",
    type: "obstruction",
    x: 1500,
    y: 1500,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 3,
    name: "Obstruction",
    points: [
      { x: 1500, y: 1500 },
      { x: 2500, y: 1500 },
      { x: 2500, y: 2500 },
      { x: 1500, y: 2500 }
    ],
    clearance: 300,
    stroke: "#b45309",
    fill: "rgba(180, 83, 9, 0.12)"
  };
}

function makeRestrictedZone(): RestrictedZoneObject {
  return {
    id: "restricted-a",
    type: "restrictedZone",
    x: 1500,
    y: 1500,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 3,
    name: "Restricted Zone",
    points: [
      { x: 1500, y: 1500 },
      { x: 2600, y: 1500 },
      { x: 2600, y: 2600 },
      { x: 1500, y: 2600 }
    ],
    stroke: "#b42318",
    fill: "rgba(180, 35, 24, 0.12)"
  };
}

function makePanel(id: string, x: number, y: number, rotation = 0): SolarPanelObject {
  return {
    id,
    type: "solarPanel",
    x,
    y,
    rotation,
    layerId: "solar",
    visible: true,
    locked: false,
    zIndex: 2,
    manufacturer: "Test",
    model: "Module",
    width: 1000,
    height: 1000,
    thickness: 35,
    wattage: 500,
    orientation: "portrait",
    moduleGap: 20
  };
}
