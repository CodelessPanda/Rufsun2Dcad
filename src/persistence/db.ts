import Dexie, { type Table } from "dexie";
import type { RufsunCadDocument } from "../types/cad";

interface SavedProject {
  id: string;
  document: RufsunCadDocument;
  savedAt: string;
}

class RufsunCadDatabase extends Dexie {
  projects!: Table<SavedProject, string>;

  constructor() {
    super("rufsunCad");
    this.version(1).stores({
      projects: "id,savedAt"
    });
  }
}

export const db = new RufsunCadDatabase();

export async function saveLastProject(document: RufsunCadDocument) {
  await db.projects.put({
    id: "last",
    document,
    savedAt: new Date().toISOString()
  });
}

export async function loadLastProject(): Promise<RufsunCadDocument | null> {
  const project = await db.projects.get("last");
  return project?.document ?? null;
}
