import type {
  CadObject,
  CircleObject,
  DimensionObject,
  LineObject,
  Point,
  RoofObject,
  SolarPanelObject
} from "../../types/cad";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angle(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function rotatePoint(point: Point, origin: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos
  };
}

export function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const x =
    ((a1.x * a2.y - a1.y * a2.x) * (b1.x - b2.x) -
      (a1.x - a2.x) * (b1.x * b2.y - b1.y * b2.x)) /
    d;
  const y =
    ((a1.x * a2.y - a1.y * a2.x) * (b1.y - b2.y) -
      (a1.y - a2.y) * (b1.x * b2.y - b1.y * b2.x)) /
    d;
  return { x, y };
}

export function nearestPointOnLine(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function pointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  const sum = points.reduce((acc, point, index) => {
    const next = points[(index + 1) % points.length];
    return acc + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(sum / 2);
}

export function rectanglesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function getBoundingBox(object: CadObject): BoundingBox {
  switch (object.type) {
    case "line":
      return boundsFromPoints([
        { x: object.x, y: object.y },
        { x: object.x2, y: object.y2 }
      ]);
    case "rectangle":
    case "solarPanel":
      return rotatedRectBounds(object.x, object.y, object.width, object.height, object.rotation);
    case "circle":
      return {
        x: object.x - object.radius,
        y: object.y - object.radius,
        width: object.radius * 2,
        height: object.radius * 2
      };
    case "polygon":
    case "roof":
      return boundsFromPoints(object.points);
    case "dimension":
      return boundsFromPoints([object.start, object.end]);
    case "text":
      return {
        x: object.x,
        y: object.y,
        width: Math.max(120, object.text.length * object.fontSize * 0.55),
        height: object.fontSize * 1.4
      };
  }
}

export function boundsFromPoints(points: Point[]): BoundingBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(0, Math.max(...xs) - minX),
    height: Math.max(0, Math.max(...ys) - minY)
  };
}

export function rectCorners(x: number, y: number, width: number, height: number, rotation = 0): Point[] {
  const center = { x: x + width / 2, y: y + height / 2 };
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ].map((point) => rotatePoint(point, center, rotation));
}

function rotatedRectBounds(x: number, y: number, width: number, height: number, rotation = 0): BoundingBox {
  return boundsFromPoints(rectCorners(x, y, width, height, rotation));
}

export function translateObject<T extends CadObject>(object: T, dx: number, dy: number): T {
  const translated = { ...object, x: object.x + dx, y: object.y + dy } as CadObject;
  if (translated.type === "line") {
    translated.x2 += dx;
    translated.y2 += dy;
  }
  if (translated.type === "polygon" || translated.type === "roof") {
    translated.points = translated.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }
  if (translated.type === "dimension") {
    translated.start = { x: translated.start.x + dx, y: translated.start.y + dy };
    translated.end = { x: translated.end.x + dx, y: translated.end.y + dy };
  }
  return translated as T;
}

export function objectSnapPoints(object: CadObject): Array<{ point: Point; kind: "endpoint" | "midpoint" | "center" | "edge" }> {
  if (object.type === "line") {
    const start = { x: object.x, y: object.y };
    const end = { x: object.x2, y: object.y2 };
    return [
      { point: start, kind: "endpoint" },
      { point: end, kind: "endpoint" },
      { point: midpoint(start, end), kind: "midpoint" }
    ];
  }
  if (object.type === "dimension") {
    return dimensionSnapPoints(object);
  }
  if (object.type === "polygon" || object.type === "roof") {
    const points = object.points.flatMap((point, index) => {
      const next = object.points[(index + 1) % object.points.length];
      return [
        { point, kind: "endpoint" as const },
        { point: midpoint(point, next), kind: "midpoint" as const }
      ];
    });
    return [...points, { point: centerOfBounds(getBoundingBox(object)), kind: "center" }];
  }
  if (object.type === "circle") {
    return [
      { point: { x: object.x, y: object.y }, kind: "center" },
      { point: { x: object.x + object.radius, y: object.y }, kind: "edge" },
      { point: { x: object.x - object.radius, y: object.y }, kind: "edge" },
      { point: { x: object.x, y: object.y + object.radius }, kind: "edge" },
      { point: { x: object.x, y: object.y - object.radius }, kind: "edge" }
    ];
  }
  const box = getBoundingBox(object);
  return [
    { point: centerOfBounds(box), kind: "center" },
    { point: { x: box.x, y: box.y }, kind: "endpoint" },
    { point: { x: box.x + box.width, y: box.y }, kind: "endpoint" },
    { point: { x: box.x + box.width, y: box.y + box.height }, kind: "endpoint" },
    { point: { x: box.x, y: box.y + box.height }, kind: "endpoint" },
    { point: { x: box.x + box.width / 2, y: box.y }, kind: "midpoint" },
    { point: { x: box.x + box.width / 2, y: box.y + box.height }, kind: "midpoint" },
    { point: { x: box.x, y: box.y + box.height / 2 }, kind: "midpoint" },
    { point: { x: box.x + box.width, y: box.y + box.height / 2 }, kind: "midpoint" }
  ];
}

function dimensionSnapPoints(object: DimensionObject) {
  return [
    { point: object.start, kind: "endpoint" as const },
    { point: object.end, kind: "endpoint" as const },
    { point: midpoint(object.start, object.end), kind: "midpoint" as const }
  ];
}

export function centerOfBounds(box: BoundingBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function formatMetric(mm: number): string {
  const value = Math.abs(mm);
  if (value >= 10000) return `${(mm / 1000).toFixed(1)} m`;
  if (value >= 1000) return `${(mm / 1000).toFixed(2).replace(/\.00$/, "")} m`;
  return `${Math.round(mm)} mm`;
}

export function formatFeetInches(mm: number): string {
  const totalInches = Math.max(0, Math.round(Math.abs(mm) / 25.4));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in`;
}

export function roofContainsPanel(panel: SolarPanelObject, roofs: RoofObject[]): boolean {
  if (roofs.length === 0) return true;
  const corners = rectCorners(panel.x, panel.y, panel.width, panel.height, panel.rotation);
  return roofs.some((roof) => corners.every((corner) => pointInsidePolygon(corner, roof.points)));
}
