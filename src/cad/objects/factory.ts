import { v4 as uuid } from "uuid";
import type {
  CadObject,
  CircleObject,
  DimensionObject,
  LineObject,
  MapCaptureSettings,
  MapImageObject,
  Point,
  PolygonObject,
  RectangleObject,
  RoofObject,
  SolarPanelObject,
  TextObject
} from "../../types/cad";
import type { SolarModuleCatalogItem } from "../../data/sampleSolarModules";
import { normalizeRoofFace } from "../site/siteModel";

export function nextZ(objects: CadObject[]) {
  return objects.reduce((max, object) => Math.max(max, object.zIndex), 0) + 1;
}

export function createLine(start: Point, end: Point, layerId: string, zIndex: number): LineObject {
  return {
    id: uuid(),
    type: "line",
    x: start.x,
    y: start.y,
    x2: end.x,
    y2: end.y,
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    stroke: "#1f2937"
  };
}

export function createRectangle(start: Point, end: Point, layerId: string, zIndex: number): RectangleObject {
  return {
    id: uuid(),
    type: "rectangle",
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(20, Math.abs(end.x - start.x)),
    height: Math.max(20, Math.abs(end.y - start.y)),
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    stroke: "#334155",
    fill: "rgba(148, 163, 184, 0.12)"
  };
}

export function createCircle(center: Point, edge: Point, layerId: string, zIndex: number): CircleObject {
  return {
    id: uuid(),
    type: "circle",
    x: center.x,
    y: center.y,
    radius: Math.max(20, Math.hypot(edge.x - center.x, edge.y - center.y)),
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    stroke: "#334155",
    fill: "rgba(148, 163, 184, 0.1)"
  };
}

export function createPolygon(points: Point[], layerId: string, zIndex: number): PolygonObject {
  return {
    id: uuid(),
    type: "polygon",
    x: points[0].x,
    y: points[0].y,
    points,
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    stroke: "#475569",
    fill: "rgba(100, 116, 139, 0.12)"
  };
}

export function createRoof(points: Point[], zIndex: number): RoofObject {
  return normalizeRoofFace({
    id: uuid(),
    type: "roof",
    x: points[0].x,
    y: points[0].y,
    points,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex,
    name: "Roof A",
    stroke: "#16855f",
    fill: "rgba(22, 133, 95, 0.13)",
    tilt: 15,
    azimuth: 180,
    heightM: 10,
    setback: 500
  });
}

export function createSolarPanel(
  position: Point,
  module: SolarModuleCatalogItem,
  layerId: string,
  zIndex: number,
  orientation: "portrait" | "landscape" = "portrait"
): SolarPanelObject {
  const width = orientation === "portrait" ? module.widthMM : module.heightMM;
  const height = orientation === "portrait" ? module.heightMM : module.widthMM;
  return {
    id: uuid(),
    type: "solarPanel",
    x: position.x,
    y: position.y,
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    manufacturer: module.manufacturer,
    model: module.model,
    width,
    height,
    thickness: module.thicknessMM,
    wattage: module.wattage,
    orientation,
    moduleGap: 20
  };
}

export function createMapImage(capture: MapCaptureSettings, zIndex: number): MapImageObject {
  return {
    id: uuid(),
    type: "mapImage",
    x: 0,
    y: 0,
    rotation: 0,
    layerId: "map",
    visible: true,
    locked: false,
    zIndex,
    width: capture.widthM * 1000,
    height: capture.heightM * 1000,
    opacity: 0.74,
    capture
  };
}

export function createDimension(start: Point, end: Point, layerId: string, zIndex: number): DimensionObject {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return {
    id: uuid(),
    type: "dimension",
    x: start.x,
    y: start.y,
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    start,
    end,
    mode: dx > dy ? "horizontal" : dy > dx ? "vertical" : "aligned"
  };
}

export function createText(position: Point, text: string, layerId: string, zIndex: number): TextObject {
  return {
    id: uuid(),
    type: "text",
    x: position.x,
    y: position.y,
    rotation: 0,
    layerId,
    visible: true,
    locked: false,
    zIndex,
    text,
    fontSize: 180,
    color: "#334155"
  };
}
