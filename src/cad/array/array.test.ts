import { describe, expect, it } from "vitest";
import type { SolarPanelObject } from "../../types/cad";
import { buildSolarArray, calculateArrayStats } from "./array";

const seed: SolarPanelObject = {
  id: "seed",
  type: "solarPanel",
  x: 1000,
  y: 2000,
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

describe("solar arrays", () => {
  it("creates exact module spacing", () => {
    const panels = buildSolarArray(seed, { rows: 2, columns: 3, horizontalGap: 20, verticalGap: 30, orientation: "portrait" });
    expect(panels).toHaveLength(6);
    expect(panels[1].x).toBe(2154);
    expect(panels[3].y).toBe(4308);
  });

  it("calculates capacity statistics", () => {
    const panels = buildSolarArray(seed, { rows: 2, columns: 2, horizontalGap: 20, verticalGap: 20, orientation: "portrait" });
    const stats = calculateArrayStats(panels);
    expect(stats.modules).toBe(4);
    expect(stats.totalWatts).toBe(2200);
    expect(stats.totalKwp).toBe(2.2);
  });
});
