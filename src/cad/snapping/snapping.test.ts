import { describe, expect, it } from "vitest";
import type { SolarPanelObject } from "../../types/cad";
import { snapPanelToPanels, snapToGrid } from "./snapping";

describe("snapping", () => {
  it("snaps points to the configured grid", () => {
    expect(snapToGrid({ x: 248, y: 752 }, 100)).toEqual({ x: 200, y: 800 });
  });

  it("magnetically snaps solar panels with an exact module gap", () => {
    const base: SolarPanelObject = {
      id: "a",
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
    const moving = { ...base, id: "b", x: 2148, y: 1006 };
    const snapped = snapPanelToPanels(moving, [base], { x: 0, y: 0, scale: 0.1 }, 24);
    expect(snapped.x).toBe(2154);
    expect(snapped.y).toBe(1000);
  });
});
