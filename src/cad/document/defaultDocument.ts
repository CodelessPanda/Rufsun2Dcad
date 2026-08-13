import { v4 as uuid } from "uuid";
import type {
  CadLayer,
  DimensionObject,
  RoofObject,
  RufsunCadDocument,
  SolarPanelObject,
  TextObject
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
    rufsunCadVersion: "0.1",
    version: "0.1",
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

  const panels: SolarPanelObject[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      panels.push({
        id: uuid(),
        type: "solarPanel",
        x: 2200 + column * (1134 + 20),
        y: 1700 + row * (2278 + 20),
        rotation: 0,
        layerId: "solar",
        visible: true,
        locked: false,
        zIndex: 10 + row * 4 + column,
        manufacturer: "Generic",
        model: "Mono 550",
        width: 1134,
        height: 2278,
        thickness: 35,
        wattage: 550,
        orientation: "portrait",
        moduleGap: 20
      });
    }
  }

  const dimension: DimensionObject = {
    id: uuid(),
    type: "dimension",
    x: 2200,
    y: 7400,
    rotation: 0,
    layerId: "dimensions",
    visible: true,
    locked: false,
    zIndex: 100,
    start: { x: 2200, y: 7400 },
    end: { x: 6814, y: 7400 },
    mode: "horizontal"
  };

  const label: TextObject = {
    id: uuid(),
    type: "text",
    x: 900,
    y: 520,
    rotation: 0,
    layerId: "annotations",
    visible: true,
    locked: false,
    zIndex: 101,
    text: "RufsunCAD demo - sample module data",
    fontSize: 220,
    color: "#334155"
  };

  return {
    ...document,
    objects: [roof, ...panels, dimension, label],
    updatedAt: new Date().toISOString()
  };
}
