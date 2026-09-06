import { describe, expect, it } from "vitest";
import { DEFAULT_ELECTRICITY_RATE_INR } from "../finance/currency";
import type { RoofObject, SolarPanelObject } from "../../types/cad";
import { calculateAllPeriods } from "./energyCalculator";

describe("calculateAllPeriods", () => {
  it("uses Google annual flux values when they are available for the panel roof", () => {
    const roof = makeRoof("roof-a");
    const panel = makePanel("panel-a", 500);

    const results = calculateAllPeriods({
      panels: [panel],
      roofs: [roof],
      averageRadiance: 800,
      annualFluxByRoofId: { [roof.id]: 1600 },
      temperatureCorrectionFactor: 0.95,
      sunlightHours: 6,
      electricityRate: DEFAULT_ELECTRICITY_RATE_INR
    });

    expect(results.year.dataSource).toBe("solar-api");
    expect(results.year.totalEnergyKwh).toBe(760);
    expect(results.year.estimatedRevenue).toBe(6080);
    expect(results.month.totalEnergyKwh).toBeCloseTo(62.47);
    expect(results.year.averageAnnualFlux).toBe(1600);
  });

  it("prefers panel-footprint flux over roof-average flux when both are available", () => {
    const roof = makeRoof("roof-a");
    const panel = makePanel("panel-a", 500);

    const results = calculateAllPeriods({
      panels: [panel],
      roofs: [roof],
      averageRadiance: 800,
      annualFluxByPanelId: { [panel.id]: { flux: 1900, method: "area-avg" as const } },
      annualFluxByRoofId: { [roof.id]: 1200 },
      temperatureCorrectionFactor: 0.95,
      sunlightHours: 6,
      electricityRate: DEFAULT_ELECTRICITY_RATE_INR
    });

    expect(results.year.dataSource).toBe("solar-api");
    expect(results.year.totalEnergyKwh).toBe(902.5);
    expect(results.year.averageAnnualFlux).toBe(1900);
  });
});

function makeRoof(id: string): RoofObject {
  return {
    id,
    type: "roof",
    x: 0,
    y: 0,
    points: [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 3000 },
      { x: 0, y: 3000 }
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
    setback: 500
  };
}

function makePanel(id: string, wattage: number): SolarPanelObject {
  return {
    id,
    type: "solarPanel",
    x: 1000,
    y: 1000,
    rotation: 0,
    layerId: "solar",
    visible: true,
    locked: false,
    zIndex: 2,
    manufacturer: "Test",
    model: "Module",
    width: 1000,
    height: 1000,
    thickness: 35,
    wattage,
    orientation: "portrait",
    moduleGap: 20
  };
}
