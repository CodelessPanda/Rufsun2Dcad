import * as ClipperLib from "clipper-lib";
import type { ObstructionObject, Point, RestrictedZoneObject, RoofObject, SolarPanelObject } from "../../types/cad";

const CLIPPER_SCALE = 1000;
const AREA_EPSILON_MM2 = 1;
const POINT_EPSILON_MM = 0.01;
const CLIPPER_STRICTLY_SIMPLE = 2;

export type PolygonValidationCode =
  | "TOO_FEW_POINTS"
  | "DUPLICATE_CONSECUTIVE_POINT"
  | "ZERO_LENGTH_EDGE"
  | "SELF_INTERSECTION"
  | "NEAR_ZERO_AREA";

export interface PolygonValidationResult {
  valid: boolean;
  reasons: PolygonValidationCode[];
}

export type PanelValidationReason =
  | "OUTSIDE_ROOF"
  | "SETBACK_VIOLATION"
  | "OBSTRUCTION_COLLISION"
  | "RESTRICTED_ZONE"
  | "PANEL_OVERLAP"
  | "INVALID_ROOF";

export interface PanelValidationResult {
  valid: boolean;
  reasons: PanelValidationReason[];
  roof?: RoofObject;
}

export function offsetPolygon(points: Point[], offsetMm: number): Point[][] {
  const path = toClipperPath(cleanPolygon(points));
  if (path.length < 3) return [];
  const offsetter = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
  offsetter.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solution: ClipperLib.Paths = [];
  offsetter.Execute(solution, offsetMm * CLIPPER_SCALE);
  return fromClipperPaths(solution).filter((polygon) => polygonArea(polygon) > AREA_EPSILON_MM2).sort((a, b) => polygonArea(b) - polygonArea(a));
}

export function unionPolygons(polygons: Point[][]): Point[][] {
  return clip(ClipperLib.ClipType.ctUnion, polygons, []);
}

export function differencePolygons(subjects: Point[][], clips: Point[][]): Point[][] {
  return clip(ClipperLib.ClipType.ctDifference, subjects, clips);
}

export function intersectPolygons(subjects: Point[][], clips: Point[][]): Point[][] {
  return clip(ClipperLib.ClipType.ctIntersection, subjects, clips);
}

export function polygonContainsPolygon(container: Point[] | Point[][], candidate: Point[]): boolean {
  const containers = Array.isArray(container[0]) ? (container as Point[][]) : [container as Point[]];
  if (containers.length === 0 || candidate.length < 3) return false;
  const candidateArea = polygonArea(candidate);
  if (candidateArea <= AREA_EPSILON_MM2) return false;
  const intersectionArea = totalPolygonArea(intersectPolygons(containers, [candidate]));
  return Math.abs(intersectionArea - candidateArea) <= Math.max(AREA_EPSILON_MM2, candidateArea * 0.0001);
}

export function polygonsIntersect(a: Point[] | Point[][], b: Point[] | Point[][]): boolean {
  const left = Array.isArray(a[0]) ? (a as Point[][]) : [a as Point[]];
  const right = Array.isArray(b[0]) ? (b as Point[][]) : [b as Point[]];
  return totalPolygonArea(intersectPolygons(left, right)) > AREA_EPSILON_MM2;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  return pointOnPolygonBoundary(point, polygon) || pointInsidePolygon(point, polygon);
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  const sum = points.reduce((acc, point, index) => {
    const next = points[(index + 1) % points.length];
    return acc + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(sum / 2);
}

export function totalPolygonArea(polygons: Point[][]): number {
  return polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

export function validatePolygon(points: Point[]): PolygonValidationResult {
  const reasons: PolygonValidationCode[] = [];
  const cleaned = cleanPolygon(points);
  if (cleaned.length < 3) reasons.push("TOO_FEW_POINTS");
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (samePoint(current, next)) reasons.push("DUPLICATE_CONSECUTIVE_POINT");
    if (distance(current, next) <= POINT_EPSILON_MM) reasons.push("ZERO_LENGTH_EDGE");
  }
  if (polygonArea(cleaned) <= AREA_EPSILON_MM2) reasons.push("NEAR_ZERO_AREA");
  if (hasSelfIntersection(cleaned)) reasons.push("SELF_INTERSECTION");
  return { valid: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}

export function roofUsablePolygons(roof: RoofObject, clearanceMm = 0): Point[][] {
  const validation = validatePolygon(roof.points);
  if (!validation.valid) return [];
  if (roof.edgeMetadata?.some((edge) => typeof edge.setback === "number")) {
    return offsetPolygonPerEdge(roof.points, roof.edgeMetadata.map((edge) => Math.max(0, edge.setback ?? roof.setback) + Math.max(0, clearanceMm)));
  }
  const inset = Math.max(0, roof.setback) + Math.max(0, clearanceMm);
  if (inset <= 0) return [cleanPolygon(roof.points)];
  return offsetPolygon(roof.points, -inset);
}

export function offsetPolygonPerEdge(points: Point[], setbacksMm: number[]): Point[][] {
  const source = cleanPolygon(points);
  let result = [source];
  if (source.length < 3) return [];
  const bounds = boundsFromPoints(source);
  const span = Math.max(bounds.width, bounds.height, 1000) + Math.max(...setbacksMm, 0) + 1_000_000;
  const center = averagePoint(source);

  for (let index = 0; index < source.length; index += 1) {
    const start = source[index];
    const end = source[(index + 1) % source.length];
    const setback = Math.max(0, setbacksMm[index] ?? 0);
    if (setback <= 0) continue;
    const halfPlane = inwardHalfPlane(start, end, center, setback, span);
    result = intersectPolygons(result, [halfPlane]);
    if (result.length === 0) return [];
  }

  return result;
}

export function panelFootprint(panel: SolarPanelObject): Point[] {
  const origin = { x: panel.x, y: panel.y };
  return [
    { x: panel.x, y: panel.y },
    { x: panel.x + panel.width, y: panel.y },
    { x: panel.x + panel.width, y: panel.y + panel.height },
    { x: panel.x, y: panel.y + panel.height }
  ].map((point) => rotatePoint(point, origin, panel.rotation));
}

export function validatePanelPlacement(
  panel: SolarPanelObject,
  context: {
    roofs: RoofObject[];
    existingPanels?: SolarPanelObject[];
    obstructions?: ObstructionObject[];
    restrictedZones?: RestrictedZoneObject[];
    clearanceMm?: number;
  }
): PanelValidationResult {
  const reasons: PanelValidationReason[] = [];
  const clearanceMm = context.clearanceMm ?? 0;
  const footprint = panelFootprint(panel);
  const validRoofs = context.roofs.filter((roof) => validatePolygon(roof.points).valid);
  if (validRoofs.length < context.roofs.length) reasons.push("INVALID_ROOF");

  const grossRoof = validRoofs.find((roof) => polygonContainsPolygon(roof.points, footprint));
  const usableRoof = validRoofs.find((roof) => polygonContainsPolygon(roofUsablePolygons(roof, clearanceMm), footprint));
  if (!grossRoof) reasons.push("OUTSIDE_ROOF");
  else if (!usableRoof) reasons.push("SETBACK_VIOLATION");

  const restrictedPolygons = context.restrictedZones?.map((zone) => zone.points) ?? [];
  if (restrictedPolygons.length && polygonsIntersect(restrictedPolygons, footprint)) reasons.push("RESTRICTED_ZONE");

  const obstructionPolygons =
    context.obstructions?.flatMap((obstruction) => offsetPolygon(obstruction.points, Math.max(0, obstruction.clearance ?? 0))) ?? [];
  if (obstructionPolygons.length && polygonsIntersect(obstructionPolygons, footprint)) reasons.push("OBSTRUCTION_COLLISION");

  const existing = context.existingPanels?.filter((other) => other.id !== panel.id) ?? [];
  if (existing.some((other) => polygonsIntersect(panelFootprint(other), footprint))) reasons.push("PANEL_OVERLAP");

  return { valid: reasons.length === 0, reasons: Array.from(new Set(reasons)), roof: usableRoof };
}

function clip(clipType: ClipperLib.ClipType, subjects: Point[][], clips: Point[][]): Point[][] {
  const subjectPaths = subjects.map((polygon) => toClipperPath(cleanPolygon(polygon))).filter((path) => path.length >= 3);
  const clipPaths = clips.map((polygon) => toClipperPath(cleanPolygon(polygon))).filter((path) => path.length >= 3);
  if (subjectPaths.length === 0) return [];
  const clipper = new ClipperLib.Clipper(CLIPPER_STRICTLY_SIMPLE);
  clipper.AddPaths(subjectPaths, ClipperLib.PolyType.ptSubject, true);
  if (clipPaths.length > 0) clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
  const solution: ClipperLib.Paths = [];
  clipper.Execute(clipType, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromClipperPaths(solution).filter((polygon) => polygonArea(polygon) > AREA_EPSILON_MM2).sort((a, b) => polygonArea(b) - polygonArea(a));
}

function cleanPolygon(points: Point[]): Point[] {
  const cleaned: Point[] = [];
  for (const point of points) {
    if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], point)) cleaned.push(point);
  }
  if (cleaned.length > 1 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();
  return cleaned;
}

function toClipperPath(points: Point[]): ClipperLib.Path {
  return points.map((point) => ({
    X: Math.round(point.x * CLIPPER_SCALE),
    Y: Math.round(point.y * CLIPPER_SCALE)
  }));
}

function fromClipperPaths(paths: ClipperLib.Paths): Point[][] {
  return paths.map((path) =>
    path.map((point) => ({
      x: point.X / CLIPPER_SCALE,
      y: point.Y / CLIPPER_SCALE
    }))
  );
}

function pointInsidePolygon(point: Point, polygon: Point[]): boolean {
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

function pointOnPolygonBoundary(point: Point, polygon: Point[]): boolean {
  return polygonEdges(polygon).some((edge) => pointOnSegment(point, edge.start, edge.end));
}

function hasSelfIntersection(points: Point[]) {
  const edges = polygonEdges(points);
  return edges.some((edge, index) =>
    edges.some((other, otherIndex) => {
      if (Math.abs(index - otherIndex) <= 1) return false;
      if (index === 0 && otherIndex === edges.length - 1) return false;
      return segmentsIntersect(edge.start, edge.end, other.start, other.end);
    })
  );
}

function polygonEdges(points: Point[]) {
  return points.map((point, index) => ({
    start: point,
    end: points[(index + 1) % points.length]
  }));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const d1 = direction(c, d, a);
  const d2 = direction(c, d, b);
  const d3 = direction(a, b, c);
  const d4 = direction(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  return (
    Math.abs(distance(start, point) + distance(point, end) - distance(start, end)) <= POINT_EPSILON_MM &&
    point.x >= Math.min(start.x, end.x) - POINT_EPSILON_MM &&
    point.x <= Math.max(start.x, end.x) + POINT_EPSILON_MM &&
    point.y >= Math.min(start.y, end.y) - POINT_EPSILON_MM &&
    point.y <= Math.max(start.y, end.y) + POINT_EPSILON_MM
  );
}

function direction(a: Point, b: Point, c: Point) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function samePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) <= POINT_EPSILON_MM && Math.abs(a.y - b.y) <= POINT_EPSILON_MM;
}

function inwardHalfPlane(start: Point, end: Point, center: Point, setback: number, span: number): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const tangent = { x: dx / length, y: dy / length };
  const leftNormal = { x: -tangent.y, y: tangent.x };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const centerVector = { x: center.x - midpoint.x, y: center.y - midpoint.y };
  const normal =
    centerVector.x * leftNormal.x + centerVector.y * leftNormal.y >= 0
      ? leftNormal
      : { x: -leftNormal.x, y: -leftNormal.y };
  const shiftedStart = { x: start.x + normal.x * setback, y: start.y + normal.y * setback };
  const shiftedEnd = { x: end.x + normal.x * setback, y: end.y + normal.y * setback };
  return [
    { x: shiftedStart.x - tangent.x * span, y: shiftedStart.y - tangent.y * span },
    { x: shiftedEnd.x + tangent.x * span, y: shiftedEnd.y + tangent.y * span },
    { x: shiftedEnd.x + tangent.x * span + normal.x * span, y: shiftedEnd.y + tangent.y * span + normal.y * span },
    { x: shiftedStart.x - tangent.x * span + normal.x * span, y: shiftedStart.y - tangent.y * span + normal.y * span }
  ];
}

function boundsFromPoints(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function averagePoint(points: Point[]): Point {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function rotatePoint(point: Point, origin: Point, degrees: number): Point {
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
