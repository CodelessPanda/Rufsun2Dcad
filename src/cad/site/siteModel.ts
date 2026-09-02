import type { RoofEdgeMetadata, RoofObject, RufsunCadDocument, SiteModel, SiteStructure, SolarPanelObject } from "../../types/cad";
import { calculateSystemCapacity } from "../energy/energyCalculator";
import { polygonArea, roofUsablePolygons, totalPolygonArea } from "../geometry/geometry";
import { imageryFromMapCapture } from "./georeferencing";

export const DEFAULT_STRUCTURE_ID = "structure-default";

export interface SiteSummary {
  structureCount: number;
  roofFaceCount: number;
  grossRoofAreaM2: number;
  usableRoofAreaM2: number;
  panelCount: number;
  systemCapacityKwp: number;
}

export function ensureSiteModel(document: RufsunCadDocument): RufsunCadDocument {
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  const site = document.site ?? createDefaultSiteModel(document);
  const structures = normalizeStructures(site.structures, roofs);
  const primaryStructureId = structures[0]?.id ?? DEFAULT_STRUCTURE_ID;
  const objects = document.objects.map((object) => {
    if (object.type !== "roof") return object;
    const structureId = structures.some((structure) => structure.id === object.structureId)
      ? object.structureId
      : primaryStructureId;
    return normalizeRoofFace({ ...object, structureId });
  });

  return {
    ...document,
    site: {
      ...site,
      northRotation: Number.isFinite(site.northRotation) ? site.northRotation : 0,
      imagery: site.imagery ?? (document.mapCapture ? imageryFromMapCapture(document.mapCapture) : undefined),
      structures: normalizeStructures(structures, objects.filter((object): object is RoofObject => object.type === "roof"))
    },
    objects
  };
}

export function createDefaultSiteModel(document: RufsunCadDocument): SiteModel {
  const roofs = document.objects.filter((object): object is RoofObject => object.type === "roof");
  return {
    northRotation: 0,
    imagery: document.mapCapture ? imageryFromMapCapture(document.mapCapture) : undefined,
    structures: normalizeStructures([], roofs)
  };
}

export function normalizeRoofFace(roof: RoofObject): RoofObject {
  const edgeMetadata = normalizeRoofEdges(roof);
  return {
    ...roof,
    structureId: roof.structureId ?? DEFAULT_STRUCTURE_ID,
    pitch: roof.pitch ?? roof.tilt,
    edgeMetadata
  };
}

export function normalizeRoofEdges(roof: RoofObject): RoofEdgeMetadata[] {
  const existing = new Map((roof.edgeMetadata ?? []).map((edge) => [edge.index, edge]));
  return roof.points.map((_, index) => {
    const current = existing.get(index);
    return {
      id: current?.id || `${roof.id}-edge-${index + 1}`,
      index,
      classification: current?.classification ?? "UNKNOWN",
      setback: current?.setback
    };
  });
}

export function calculateSiteSummary(document: RufsunCadDocument): SiteSummary {
  const normalized = ensureSiteModel(document);
  const roofs = normalized.objects.filter((object): object is RoofObject => object.type === "roof");
  const panels = normalized.objects.filter((object): object is SolarPanelObject => object.type === "solarPanel");
  const grossRoofArea = roofs.reduce((sum, roof) => sum + polygonArea(roof.points), 0);
  const usableRoofArea = roofs.reduce((sum, roof) => sum + totalPolygonArea(roofUsablePolygons(roof)), 0);

  return {
    structureCount: normalized.site?.structures.length ?? 0,
    roofFaceCount: roofs.length,
    grossRoofAreaM2: round(grossRoofArea / 1_000_000),
    usableRoofAreaM2: round(usableRoofArea / 1_000_000),
    panelCount: panels.length,
    systemCapacityKwp: round(calculateSystemCapacity(panels))
  };
}

export function roofsForStructure(document: RufsunCadDocument, structureId: string): RoofObject[] {
  return ensureSiteModel(document).objects.filter(
    (object): object is RoofObject => object.type === "roof" && (object.structureId ?? DEFAULT_STRUCTURE_ID) === structureId
  );
}

function normalizeStructures(structures: SiteStructure[], roofs: RoofObject[]): SiteStructure[] {
  const byId = new Map(structures.map((structure) => [structure.id, { ...structure, roofFaceIds: [] as string[] }]));
  if (!byId.size) {
    byId.set(DEFAULT_STRUCTURE_ID, { id: DEFAULT_STRUCTURE_ID, name: "Main Structure", buildingType: "house", roofFaceIds: [] });
  }

  const fallbackId = byId.keys().next().value as string;
  for (const roof of roofs) {
    const structureId = roof.structureId && byId.has(roof.structureId) ? roof.structureId : fallbackId;
    const structure = byId.get(structureId);
    if (structure && !structure.roofFaceIds.includes(roof.id)) structure.roofFaceIds.push(roof.id);
  }

  return Array.from(byId.values());
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
