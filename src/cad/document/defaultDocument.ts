import { v4 as uuid } from "uuid";
import type {
  CadLayer,
  MapCaptureSettings,
  RoofObject,
  RufsunCadDocument
} from "../../types/cad";
import { createDefaultSiteModel, DEFAULT_STRUCTURE_ID, normalizeRoofFace } from "../site/siteModel";

export const defaultLayers: CadLayer[] = [
  { id: "map", name: "Map", color: "#315b8f", visible: true, locked: false },
  { id: "structures", name: "Structures", color: "#0f766e", visible: true, locked: false },
  { id: "roof", name: "Roof", color: "#16855f", visible: true, locked: false },
  { id: "obstructions", name: "Obstructions", color: "#b45309", visible: true, locked: false },
  { id: "solar", name: "Solar", color: "#f28c28", visible: true, locked: false },
  { id: "equipment", name: "Equipment", color: "#4f46e5", visible: true, locked: false },
  { id: "vegetation", name: "Vegetation", color: "#4d7c0f", visible: true, locked: false },
  { id: "dimensions", name: "Dimensions", color: "#315b8f", visible: true, locked: false },
  { id: "annotations", name: "Annotations", color: "#64748b", visible: true, locked: false },
  { id: "general", name: "General", color: "#334155", visible: true, locked: false }
];

export function createBlankDocument(
  name = "Untitled RufsunCAD Project",
  customerName = "",
  customerAddress = "",
  mapCapture?: MapCaptureSettings
): RufsunCadDocument {
  const now = new Date().toISOString();
  const document: RufsunCadDocument = {
    rufsunCadVersion: "0.2",
    version: "0.2",
    name,
    customerName,
    customerAddress,
    mapCapture,
    solarRegistration: {
      eastOffsetMeters: 0,
      northOffsetMeters: 0,
      rotationDegrees: 0,
      scale: 1,
      calibrated: false
    },
    site: {
      northRotation: 0,
      structures: [{ id: DEFAULT_STRUCTURE_ID, name: "Main Structure", buildingType: "house", roofFaceIds: [] }],
      imagery: mapCapture
        ? {
            provider: "google",
            latitude: mapCapture.latitude,
            longitude: mapCapture.longitude,
            zoom: mapCapture.zoom,
            imageWidthPx: mapCapture.imageWidthPx,
            imageHeightPx: mapCapture.imageHeightPx,
            widthM: mapCapture.widthM,
            heightM: mapCapture.heightM,
            metersPerPixelX: mapCapture.widthM / mapCapture.imageWidthPx,
            metersPerPixelY: mapCapture.heightM / mapCapture.imageHeightPx
          }
        : undefined
    },
    units: "mm",
    objects: mapCapture
      ? [
          {
            id: uuid(),
            type: "mapImage",
            x: 0,
            y: 0,
            rotation: 0,
            layerId: "map",
            visible: true,
            locked: false,
            zIndex: -1000,
            width: mapCapture.widthM * 1000,
            height: mapCapture.heightM * 1000,
            opacity: 0.74,
            capture: mapCapture
          }
        ]
      : [],
    layers: defaultLayers,
    settings: {
      activeLayerId: "general",
      grid: {
        visible: true,
        minor: 100,
        major: 500
      },
      snap: {
        enabled: true,
        grid: true,
        endpoints: true,
        midpoints: true,
        centers: true,
        edges: true,
        alignment: true,
        tolerancePx: 12
      }
    },
    createdAt: now,
    updatedAt: now
  };
  return { ...document, site: createDefaultSiteModel(document) };
}

export function createDemoDocument(): RufsunCadDocument {
  const document = createBlankDocument("RufsunCAD Demo Roof Layout");
  const roof: RoofObject = normalizeRoofFace({
    id: uuid(),
    type: "roof",
    x: 800,
    y: 800,
    rotation: 0,
    layerId: "roof",
    visible: true,
    locked: false,
    zIndex: 0,
    name: "Roof A",
    points: [
      { x: 700, y: 700 },
      { x: 10200, y: 900 },
      { x: 11000, y: 6300 },
      { x: 7600, y: 7600 },
      { x: 900, y: 6100 }
    ],
    stroke: "#16855f",
    fill: "rgba(22, 133, 95, 0.12)",
    tilt: 15,
    azimuth: 180,
    heightM: 10,
    setback: 500
  });

  return {
    ...document,
    site: {
      ...document.site,
      northRotation: document.site?.northRotation ?? 0,
      structures: [{ id: DEFAULT_STRUCTURE_ID, name: "Main Structure", buildingType: "house", roofFaceIds: [roof.id] }]
    },
    objects: [roof],
    updatedAt: new Date().toISOString()
  };
}
