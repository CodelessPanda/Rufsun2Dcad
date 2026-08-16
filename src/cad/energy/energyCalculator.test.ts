import { describe, expect, it } from "vitest";
import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { calculateEnergyGeneration, calculateSystemCostEstimate, filterPanelsOnRoofs } from "./energyCalculator";

const roof: RoofObject = {
  id: "roof",
  type: "roof",
  x: 0,
  y: 0,
  rotation: 0,
  layerId: "roof",
  visible: true,
  locked: false,
  zIndex: 0,
  name: "Roof",
  points: [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 5000 },
    { x: 0, y: 5000 }
  ],
  stroke: "#16855f",
  fill: "rgba(22, 133, 95, 0.12)",
  tilt: 15,
  azimuth: 180,
  heightM: 10,
  setback: 500
};

const panel: SolarPanelObject = {
  id: "panel",
  type: "solarPanel",
  x: 1000,
  y: 1000,
  width: 1134,
  height: 2278,
  rotation: 0,
  layerId: "solar",
  visible: true,
  locked: false,
  zIndex: 1,
  manufacturer: "Generic",
  model: "Mono 550",
  thickness: 35,
  wattage: 550,
  orientation: "portrait",
  moduleGap: 20
};

describe("energy calculations", () => {
  it("counts only panels inside roofs", () => {
    const outside = { ...panel, id: "outside", x: 6000 };
    expect(filterPanelsOnRoofs([panel, outside], [roof]).map((item) => item.id)).toEqual(["panel"]);
  });

  it("calculates nonzero generation for panels inside a roof", () => {
    const result = calculateEnergyGeneration({ panels: [panel], roofs: [roof], averageRadiance: 800 }, "month");
    expect(result.panelCount).toBe(1);
    expect(result.totalCapacity).toBe(0.55);
    expect(result.totalEnergyKwh).toBeGreaterThan(0);
  });

  it("estimates system cost and payback from capacity and savings", () => {
    const result = calculateSystemCostEstimate(8, 1600, 2.5);
    expect(result.systemCost).toBe(20000);
    expect(result.annualSavings).toBe(1600);
    expect(result.paybackYears).toBe(12.5);
    expect(result.firstYearNet).toBe(-18400);
  });
});
