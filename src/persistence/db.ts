import Dexie, { type Table } from "dexie";
import { v4 as uuid } from "uuid";
import type { MapCaptureSettings, RufsunCadDocument } from "../types/cad";
import { createBlankDocument } from "../cad/document/defaultDocument";

export interface SavedProject {
  id: string;
  cloudProjectId?: string;
  workspaceId?: string;
  customerId?: string;
  projectName?: string;
  status?: string;
  document: RufsunCadDocument;
  customerName: string;
  address: string;
  createdAt: string;
  savedAt: string;
  locallyModified?: boolean;
  cloudSavedAt?: string;
}

class RufsunCadDatabase extends Dexie {
  projects!: Table<SavedProject, string>;

  constructor() {
    super("rufsunCad");
    this.version(1).stores({
      projects: "id,savedAt"
    });
    this.version(2).stores({
      projects: "id,createdAt,savedAt,customerName,address"
    });
    this.version(3).stores({
      projects: "id,cloudProjectId,workspaceId,customerId,createdAt,savedAt,customerName,address,locallyModified"
    });
  }
}

export const db = new RufsunCadDatabase();

export async function saveProject(id: string, document: RufsunCadDocument, metadata: Partial<SavedProject> = {}) {
  const existing = await db.projects.get(id);
  await db.projects.put({
    ...existing,
    ...metadata,
    id,
    document,
    projectName: metadata.projectName ?? existing?.projectName ?? document.name,
    customerName: document.customerName?.trim() || document.name,
    address: document.customerAddress?.trim() || "",
    createdAt: existing?.createdAt || metadata.createdAt || document.createdAt,
    savedAt: new Date().toISOString()
  });
}

export async function cacheCloudProject(
  workspaceId: string,
  cloudProjectId: string,
  document: RufsunCadDocument,
  metadata: Partial<SavedProject> = {}
) {
  await saveProject(cloudProjectId, document, {
    ...metadata,
    id: cloudProjectId,
    workspaceId,
    cloudProjectId,
    locallyModified: metadata.locallyModified ?? false
  });
}

export async function createProject(customerName: string, address: string, mapCapture?: MapCaptureSettings): Promise<SavedProject> {
  const trimmedName = customerName.trim();
  const trimmedAddress = address.trim();
  const document = createBlankDocument(
    trimmedName ? `${trimmedName} Solar Layout` : "Untitled Solar Layout",
    trimmedName,
    trimmedAddress,
    mapCapture
  );
  const project: SavedProject = {
    id: uuid(),
    document,
    customerName: document.customerName || document.name,
    address: document.customerAddress || "",
    createdAt: document.createdAt,
    savedAt: document.updatedAt
  };
  await db.projects.put(project);
  return project;
}

export async function listProjects(): Promise<SavedProject[]> {
  const projects = await db.projects.toArray();
  return projects
    .map(normalizeSavedProject)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function loadProject(id: string): Promise<RufsunCadDocument | null> {
  const project = await db.projects.get(id);
  return project?.document ?? null;
}

export async function deleteProject(id: string) {
  await db.projects.delete(id);
}

export async function saveLastProject(document: RufsunCadDocument) {
  await saveProject("last", document);
}

export async function loadLastProject(): Promise<RufsunCadDocument | null> {
  const project = await db.projects.get("last");
  return project?.document ?? null;
}

function normalizeSavedProject(project: SavedProject): SavedProject {
  return {
    id: project.id,
    cloudProjectId: project.cloudProjectId,
    workspaceId: project.workspaceId,
    customerId: project.customerId,
    projectName: project.projectName,
    status: project.status,
    document: project.document,
    customerName: project.customerName || project.document.customerName || project.document.name,
    address: project.address || project.document.customerAddress || "",
    createdAt: project.createdAt || project.document.createdAt || project.savedAt,
    savedAt: project.savedAt,
    locallyModified: project.locallyModified,
    cloudSavedAt: project.cloudSavedAt
  };
}
