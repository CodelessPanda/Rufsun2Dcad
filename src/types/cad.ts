export type CadUnits = "mm";

export type CadTool =
  | "select"
  | "pan"
  | "line"
  | "rectangle"
  | "circle"
  | "polygon"
  | "roof"
  | "solar"
  | "dimension"
  | "measure"
  | "text";

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CadLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface CadObjectBase {
  id: string;
  type: CadObjectType;
  x: number;
  y: number;
  rotation: number;
  layerId: string;
  visible: boolean;
  locked: boolean;
  zIndex: number;
}

export type CadObjectType =
  | "line"
  | "rectangle"
  | "circle"
  | "polygon"
  | "text"
  | "dimension"
  | "solarPanel"
  | "roof";

export interface LineObject extends CadObjectBase {
  type: "line";
  x2: number;
  y2: number;
  stroke: string;
}

export interface RectangleObject extends CadObjectBase {
  type: "rectangle";
  width: number;
  height: number;
  stroke: string;
  fill: string;
}

export interface CircleObject extends CadObjectBase {
  type: "circle";
  radius: number;
  stroke: string;
  fill: string;
}

export interface PolygonObject extends CadObjectBase {
  type: "polygon";
  points: Point[];
  stroke: string;
  fill: string;
}

export interface RoofObject extends CadObjectBase {
  type: "roof";
  name: string;
  points: Point[];
  stroke: string;
  fill: string;
  tilt: number;
  azimuth: number;
  heightM: number;
  setback: number;
}

export interface TextObject extends CadObjectBase {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
}

export interface DimensionObject extends CadObjectBase {
  type: "dimension";
  start: Point;
  end: Point;
  mode: "horizontal" | "vertical" | "aligned";
}

export interface SolarPanelObject extends CadObjectBase {
  type: "solarPanel";
  manufacturer: string;
  model: string;
  width: number;
  height: number;
  thickness: number;
  wattage: number;
  orientation: "portrait" | "landscape";
  moduleGap: number;
  warning?: string;
}

export type CadObject =
  | LineObject
  | RectangleObject
  | CircleObject
  | PolygonObject
  | RoofObject
  | TextObject
  | DimensionObject
  | SolarPanelObject;

export interface GridSettings {
  visible: boolean;
  minor: number;
  major: number;
}

export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  endpoints: boolean;
  midpoints: boolean;
  centers: boolean;
  edges: boolean;
  alignment: boolean;
  tolerancePx: number;
}

export interface RufsunCadDocument {
  rufsunCadVersion: "0.2";
  version: string;
  name: string;
  units: CadUnits;
  objects: CadObject[];
  layers: CadLayer[];
  settings: {
    grid: GridSettings;
    snap: SnapSettings;
    activeLayerId: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type DraftState =
  | { type: "line"; start: Point; current: Point }
  | { type: "rectangle"; start: Point; current: Point }
  | { type: "circle"; center: Point; current: Point }
  | { type: "polygon"; points: Point[]; current: Point; roof: boolean }
  | { type: "dimension" | "measure"; start: Point; current: Point }
  | null;

export interface SnapGuide {
  orientation: "vertical" | "horizontal";
  value: number;
  label?: string;
}

export interface SnapMarker {
  point: Point;
  kind: "grid" | "endpoint" | "midpoint" | "center" | "edge" | "alignment";
}
