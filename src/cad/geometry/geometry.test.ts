import { describe, expect, it } from "vitest";
import { distance, formatFeetInches, lineIntersection, midpoint, pointInsidePolygon, rectanglesOverlap } from "./geometry";

describe("geometry utilities", () => {
  it("calculates distances in millimeters", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000);
  });

  it("calculates midpoints", () => {
    expect(midpoint({ x: 100, y: 200 }, { x: 300, y: 800 })).toEqual({ x: 200, y: 500 });
  });

  it("finds line intersections", () => {
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 1000, y: 0 })).toEqual({
      x: 500,
      y: 500
    });
  });

  it("detects points inside polygons", () => {
    const roof = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 5000 },
      { x: 0, y: 5000 }
    ];
    expect(pointInsidePolygon({ x: 2500, y: 2500 }, roof)).toBe(true);
    expect(pointInsidePolygon({ x: 6000, y: 2500 }, roof)).toBe(false);
  });

  it("detects overlapping bounds", () => {
    expect(rectanglesOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(rectanglesOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 150, y: 150, width: 100, height: 100 })).toBe(false);
  });

  it("formats roof segment lengths in feet and inches", () => {
    expect(formatFeetInches(304.8)).toBe("1 ft 0 in");
    expect(formatFeetInches(381)).toBe("1 ft 3 in");
  });
});
