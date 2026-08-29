import { describe, expect, it } from "vitest";
import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { roofContainsPanel } from "./geometry";

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
});

function makeRoof(setback = 500): RoofObject {
  return {
    id: "roof-a",
    type: "roof",
    x: 0,
    y: 0,
    points: [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 5000 },
      { x: 0, y: 5000 }
    ],
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
