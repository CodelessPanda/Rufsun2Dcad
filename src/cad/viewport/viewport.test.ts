import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen, zoomAroundPoint } from "./viewport";

describe("viewport conversion", () => {
  it("round-trips world and screen coordinates", () => {
    const viewport = { x: 120, y: 80, scale: 0.1 };
    const world = { x: 2500, y: 1800 };
    expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
  });

  it("keeps the pointer's world point stable while zooming", () => {
    const viewport = { x: 100, y: 50, scale: 0.1 };
    const pointer = { x: 500, y: 300 };
    const before = screenToWorld(pointer, viewport);
    const afterViewport = zoomAroundPoint(viewport, pointer, 0.2);
    const after = screenToWorld(pointer, afterViewport);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
