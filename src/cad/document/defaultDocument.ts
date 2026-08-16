import { v4 as uuid } from "uuid";
import type {
  CadLayer,
  RoofObject,
  RufsunCadDocument
} from "../../types/cad";

export const defaultLayers: CadLayer[] = [
  { id: "roof", name: "Roof", color: "#16855f", visible: true, locked: false },
  { id: "solar", name: "Solar", color: "#f28c28", visible: true, locked: false },
  { id: "dimensions", name: "Dimensions", color: "#315b8f", visible: true, locked: false },
  { id: "annotations", name: "Annotations", color: "#64748b", visible: true, locked: false },
  { id: "general", name: "General", color: "#334155", visible: true, locked: false }
];

export function createBlankDocument(name = "Untitled RufsunCAD Project"): RufsunCadDocument {
  const now = new Date().toISOString();
  return {
    rufsunCadVersion: "0.2",
    version: "0.2",
    name,
    units: "mm",
    objects: [],
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
}

export function createDemoDocument(): RufsunCadDocument {
  const document = createBlankDocument("RufsunCAD Demo Roof Layout");
  const roof: RoofObject = {
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
  };

  return {
    ...document,
    objects: [roof],
    updatedAt: new Date().toISOString()
  };
}
