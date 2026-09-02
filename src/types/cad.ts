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

export type RoofEdgeClassification = "EAVE" | "RIDGE" | "HIP" | "VALLEY" | "RAKE" | "UNKNOWN";

export interface RoofEdgeMetadata {
  id: string;
  index: number;
  classification: RoofEdgeClassification;
  setback?: number;
}

export interface SiteStructure {
  id: string;
  name: string;
  roofFaceIds: string[];
  buildingType?: "house" | "garage" | "shed" | "commercial" | "other";
  notes?: string;
}

export interface ImageryMetadata {
  provider: "google" | "airbus" | "skyfi" | "vexcel" | "other";
  sourceId?: string;
  captureDate?: string;
  latitude: number;
  longitude: number;
  zoom: number;
  imageWidthPx: number;
  imageHeightPx: number;
  widthM: number;
  heightM: number;
  metersPerPixelX: number;
  metersPerPixelY: number;
}

export interface ScaleCalibration {
  knownDistanceM: number;
  measuredDistanceMm: number;
  calibratedAt: string;
}

export interface SiteModel {
  northRotation: number;
  structures: SiteStructure[];
  imagery?: ImageryMetadata;
  scaleCalibration?: ScaleCalibration;
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
  | "obstruction"
  | "restrictedZone"
  | "equipment"
  | "vegetation"
  | "text"
  | "dimension"
  | "solarPanel"
  | "mapImage"
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

export interface ObstructionObject extends CadObjectBase {
  type: "obstruction";
  name: string;
  obstructionType?: "skylight" | "chimney" | "hvac" | "roofHatch" | "vent" | "tank" | "other";
  points: Point[];
  clearance: number;
  stroke: string;
  fill: string;
}

export interface RestrictedZoneObject extends CadObjectBase {
  type: "restrictedZone";
  name: string;
  points: Point[];
  stroke: string;
  fill: string;
}

export interface EquipmentObject extends CadObjectBase {
  type: "equipment";
  name: string;
  equipmentType?: "inverter" | "disconnect" | "mainPanel" | "battery" | "utilityMeter" | "other";
  width: number;
  height: number;
  stroke: string;
  fill: string;
}

export interface VegetationObject extends CadObjectBase {
  type: "vegetation";
  label: string;
  radius: number;
  heightM?: number;
  stroke: string;
  fill: string;
}

export interface RoofObject extends CadObjectBase {
  type: "roof";
  name: string;
  structureId?: string;
  points: Point[];
  stroke: string;
  fill: string;
  tilt: number;
  pitch?: number;
  azimuth: number;
  heightM: number;
  elevationM?: number;
  roofType?: "flat" | "pitched" | "shed" | "gable" | "hip" | "other";
  material?: "metal" | "tile" | "shingle" | "concrete" | "other";
  setback: number;
  edgeMetadata?: RoofEdgeMetadata[];
}

export interface MapCaptureSettings {
  latitude: number;
  longitude: number;
  zoom: number;
  widthM: number;
  heightM: number;
  imageWidthPx: number;
  imageHeightPx: number;
  mapType: "satellite" | "roadmap" | "hybrid";
}

export interface SolarRegistration {
  eastOffsetMeters: number;
  northOffsetMeters: number;
  rotationDegrees: number;
  scale: number;
  calibrated: boolean;
}

export interface MapImageObject extends CadObjectBase {
  type: "mapImage";
  width: number;
  height: number;
  opacity: number;
  capture: MapCaptureSettings;
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
  | ObstructionObject
  | RestrictedZoneObject
  | EquipmentObject
  | VegetationObject
  | RoofObject
  | MapImageObject
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
  customerName?: string;
  customerAddress?: string;
  mapCapture?: MapCaptureSettings;
  solarRegistration?: SolarRegistration;
  site?: SiteModel;
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
