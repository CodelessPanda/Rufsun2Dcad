import type { CadObject, Point, SnapGuide, SnapMarker, SnapSettings, SolarPanelObject, Viewport } from "../../types/cad";
import { centerOfBounds, getBoundingBox, objectSnapPoints } from "../geometry/geometry";

export interface SnapResult {
  point: Point;
  marker?: SnapMarker;
}

export interface PanelSnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
  marker?: SnapMarker;
}

export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

export function calculateSnap(
  point: Point,
  objects: CadObject[],
  settings: SnapSettings,
  gridSize: number,
  viewport: Viewport,
  excludeIds: string[] = []
): SnapResult {
  if (!settings.enabled) return { point };
  const toleranceWorld = settings.tolerancePx / viewport.scale;
  let best: { point: Point; kind: SnapMarker["kind"]; distance: number } | null = null;

  if (settings.grid) {
    const gridPoint = snapToGrid(point, gridSize);
    best = { point: gridPoint, kind: "grid", distance: Math.hypot(gridPoint.x - point.x, gridPoint.y - point.y) };
  }

  for (const object of objects) {
    if (excludeIds.includes(object.id) || !object.visible) continue;
    for (const candidate of objectSnapPoints(object)) {
      if (!settings[candidate.kind === "endpoint" ? "endpoints" : candidate.kind === "midpoint" ? "midpoints" : candidate.kind === "center" ? "centers" : "edges"]) {
        continue;
      }
      const d = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
      if (d <= toleranceWorld && (!best || d < best.distance)) {
        best = { point: candidate.point, kind: candidate.kind, distance: d };
      }
    }
  }

  if (!best || best.distance > toleranceWorld) {
    return { point };
  }
  return { point: best.point, marker: { point: best.point, kind: best.kind } };
}

export function snapPanelToPanels(
  moving: SolarPanelObject,
  objects: CadObject[],
  viewport: Viewport,
  tolerancePx: number,
  excludeIds: string[] = [moving.id]
): PanelSnapResult {
  const toleranceWorld = Math.max(tolerancePx / viewport.scale, moving.moduleGap + 160);
  const movingBox = getBoundingBox(moving);
  const movingCenter = centerOfBounds(movingBox);
  let best: { dx: number; dy: number; distance: number; priority: number; guides: SnapGuide[]; point: Point } | null = null;

  for (const target of objects) {
    if (excludeIds.includes(target.id) || target.type !== "solarPanel" || !target.visible) continue;
    const gap = moving.moduleGap;
    const targetBox = getBoundingBox(target);
    const targetCenter = centerOfBounds(targetBox);
    const sideAlignment = nearestVerticalAlignment(movingBox, targetBox, movingCenter.y, targetCenter.y, toleranceWorld);
    const stackAlignment = nearestHorizontalAlignment(movingBox, targetBox, movingCenter.x, targetCenter.x, toleranceWorld);
    const tests = [
      {
        dx: targetBox.x + targetBox.width + gap - movingBox.x,
        dy: sideAlignment.dy,
        distance: Math.hypot(targetBox.x + targetBox.width + gap - movingBox.x, sideAlignment.distance),
        guides: [
          { orientation: "vertical" as const, value: targetBox.x + targetBox.width + gap, label: `${gap} mm gap` },
          sideAlignment.guide
        ],
        priority: 0
      },
      {
        dx: targetBox.x - gap - (movingBox.x + movingBox.width),
        dy: sideAlignment.dy,
        distance: Math.hypot(targetBox.x - gap - (movingBox.x + movingBox.width), sideAlignment.distance),
        guides: [
          { orientation: "vertical" as const, value: targetBox.x - gap, label: `${gap} mm gap` },
          sideAlignment.guide
        ],
        priority: 0
      },
      {
        dx: stackAlignment.dx,
        dy: targetBox.y + targetBox.height + gap - movingBox.y,
        distance: Math.hypot(stackAlignment.distance, targetBox.y + targetBox.height + gap - movingBox.y),
        guides: [
          { orientation: "horizontal" as const, value: targetBox.y + targetBox.height + gap, label: `${gap} mm gap` },
          stackAlignment.guide
        ],
        priority: 0
      },
      {
        dx: stackAlignment.dx,
        dy: targetBox.y - gap - (movingBox.y + movingBox.height),
        distance: Math.hypot(stackAlignment.distance, targetBox.y - gap - (movingBox.y + movingBox.height)),
        guides: [
          { orientation: "horizontal" as const, value: targetBox.y - gap, label: `${gap} mm gap` },
          stackAlignment.guide
        ],
        priority: 0
      },
      {
        dx: targetCenter.x - movingCenter.x,
        dy: 0,
        distance: Math.abs(targetCenter.x - movingCenter.x),
        guides: [{ orientation: "vertical" as const, value: targetCenter.x, label: "centers aligned" }],
        priority: 1
      },
      {
        dx: 0,
        dy: targetCenter.y - movingCenter.y,
        distance: Math.abs(targetCenter.y - movingCenter.y),
        guides: [{ orientation: "horizontal" as const, value: targetCenter.y, label: "centers aligned" }],
        priority: 1
      }
    ];

    for (const test of tests) {
      if (test.distance <= toleranceWorld && (!best || test.priority < best.priority || (test.priority === best.priority && test.distance < best.distance))) {
        best = {
          ...test,
          point: { x: movingBox.x + test.dx, y: movingBox.y + test.dy }
        };
      }
    }
  }

  if (!best) return { x: moving.x, y: moving.y, guides: [] };
  return {
    x: moving.x + best.dx,
    y: moving.y + best.dy,
    guides: best.guides,
    marker: { point: best.point, kind: "alignment" }
  };
}

function nearestVerticalAlignment(
  movingBox: { y: number; height: number },
  targetBox: { y: number; height: number },
  movingCenterY: number,
  targetCenterY: number,
  toleranceWorld: number
) {
  const options = [
    {
      dy: targetBox.y - movingBox.y,
      distance: Math.abs(targetBox.y - movingBox.y),
      guide: { orientation: "horizontal" as const, value: targetBox.y, label: "tops aligned" }
    },
    {
      dy: targetBox.y + targetBox.height - (movingBox.y + movingBox.height),
      distance: Math.abs(targetBox.y + targetBox.height - (movingBox.y + movingBox.height)),
      guide: { orientation: "horizontal" as const, value: targetBox.y + targetBox.height, label: "bottoms aligned" }
    },
    {
      dy: targetCenterY - movingCenterY,
      distance: Math.abs(targetCenterY - movingCenterY),
      guide: { orientation: "horizontal" as const, value: targetCenterY, label: "centers aligned" }
    },
    {
      dy: 0,
      distance: rangesOverlap(movingBox.y, movingBox.y + movingBox.height, targetBox.y, targetBox.y + targetBox.height)
        ? 0
        : toleranceWorld + 1,
      guide: { orientation: "horizontal" as const, value: movingCenterY, label: "rows overlap" }
    }
  ];
  const aligned = options.slice(0, 3).sort((a, b) => a.distance - b.distance)[0];
  return aligned.distance <= toleranceWorld ? aligned : options[3];
}

function nearestHorizontalAlignment(
  movingBox: { x: number; width: number },
  targetBox: { x: number; width: number },
  movingCenterX: number,
  targetCenterX: number,
  toleranceWorld: number
) {
  const options = [
    {
      dx: targetBox.x - movingBox.x,
      distance: Math.abs(targetBox.x - movingBox.x),
      guide: { orientation: "vertical" as const, value: targetBox.x, label: "left edges aligned" }
    },
    {
      dx: targetBox.x + targetBox.width - (movingBox.x + movingBox.width),
      distance: Math.abs(targetBox.x + targetBox.width - (movingBox.x + movingBox.width)),
      guide: { orientation: "vertical" as const, value: targetBox.x + targetBox.width, label: "right edges aligned" }
    },
    {
      dx: targetCenterX - movingCenterX,
      distance: Math.abs(targetCenterX - movingCenterX),
      guide: { orientation: "vertical" as const, value: targetCenterX, label: "centers aligned" }
    },
    {
      dx: 0,
      distance: rangesOverlap(movingBox.x, movingBox.x + movingBox.width, targetBox.x, targetBox.x + targetBox.width)
        ? 0
        : toleranceWorld + 1,
      guide: { orientation: "vertical" as const, value: movingCenterX, label: "columns overlap" }
    }
  ];
  const aligned = options.slice(0, 3).sort((a, b) => a.distance - b.distance)[0];
  return aligned.distance <= toleranceWorld ? aligned : options[3];
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && aEnd >= bStart;
}
