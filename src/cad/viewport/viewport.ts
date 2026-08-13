import type { Point, Viewport } from "../../types/cad";

export const BASE_SCALE = 0.1;
export const MIN_SCALE = BASE_SCALE * 0.1;
export const MAX_SCALE = BASE_SCALE * 20;

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale
  };
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomAroundPoint(
  viewport: Viewport,
  screenPoint: Point,
  nextScale: number
): Viewport {
  const scale = clampScale(nextScale);
  const world = screenToWorld(screenPoint, viewport);
  return {
    scale,
    x: screenPoint.x - world.x * scale,
    y: screenPoint.y - world.y * scale
  };
}

export function zoomPercent(scale: number): number {
  return Math.round((scale / BASE_SCALE) * 100);
}
