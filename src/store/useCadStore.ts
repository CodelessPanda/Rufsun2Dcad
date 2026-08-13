import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  CadLayer,
  CadObject,
  CadTool,
  DraftState,
  Point,
  RufsunCadDocument,
  SnapGuide,
  SnapMarker,
  SolarPanelObject,
  Viewport
} from "../types/cad";
import { createBlankDocument, createDemoDocument } from "../cad/document/defaultDocument";
import { BASE_SCALE } from "../cad/viewport/viewport";
import { calculateArrayStats } from "../cad/array/array";
import { roofContainsPanel, translateObject } from "../cad/geometry/geometry";

interface CadState {
  document: RufsunCadDocument;
  selectedIds: string[];
  activeTool: CadTool;
  viewport: Viewport;
  pointerWorld: Point;
  draft: DraftState;
  snapMarker?: SnapMarker;
  guides: SnapGuide[];
  clipboard: CadObject[];
  historyPast: RufsunCadDocument[];
  historyFuture: RufsunCadDocument[];
  autosaveStatus: "idle" | "saving" | "saved" | "error";
  selectedModuleId: string;
  contextMenu: { x: number; y: number; ids: string[] } | null;
  setDocument: (document: RufsunCadDocument, recordHistory?: boolean) => void;
  newProject: () => void;
  loadDemo: () => void;
  setActiveTool: (tool: CadTool) => void;
  setViewport: (viewport: Viewport) => void;
  setPointerWorld: (point: Point) => void;
  setDraft: (draft: DraftState) => void;
  setSnapMarker: (marker?: SnapMarker) => void;
  setGuides: (guides: SnapGuide[]) => void;
  setSelectedModuleId: (id: string) => void;
  selectOnly: (id?: string) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;
  addObjects: (objects: CadObject[], selectIds?: string[]) => void;
  updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void;
  replaceObject: (object: CadObject, recordHistory?: boolean) => void;
  translateObjects: (ids: string[], dx: number, dy: number, recordHistory?: boolean) => void;
  applyDragFromOriginals: (originals: CadObject[], dx: number, dy: number, recordHistory?: boolean) => void;
  deleteSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  setLayer: (layerId: string, patch: Partial<CadLayer>) => void;
  setActiveLayer: (layerId: string) => void;
  setAutosaveStatus: (status: CadState["autosaveStatus"]) => void;
  setContextMenu: (menu: CadState["contextMenu"]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  lockObjects: (ids: string[], locked: boolean) => void;
}

const initialDocument = createBlankDocument();

function touch(document: RufsunCadDocument): RufsunCadDocument {
  return { ...document, updatedAt: new Date().toISOString() };
}

function withHistory(state: CadState, document: RufsunCadDocument, selectedIds = state.selectedIds) {
  return {
    document: touch(document),
    selectedIds,
    historyPast: [...state.historyPast, state.document].slice(-80),
    historyFuture: []
  };
}

function canModify(object: CadObject, layers: CadLayer[]) {
  const layer = layers.find((item) => item.id === object.layerId);
  return object.visible && !object.locked && !layer?.locked;
}

function cloneObject(object: CadObject, offset = 250): CadObject {
  const cloned = translateObject({ ...object, id: uuid(), zIndex: object.zIndex + 1 } as CadObject, offset, offset);
  if (cloned.type === "roof") cloned.name = `${cloned.name} Copy`;
  return cloned;
}

export const useCadStore = create<CadState>((set, get) => ({
  document: initialDocument,
  selectedIds: [],
  activeTool: "select",
  viewport: { x: 320, y: 120, scale: BASE_SCALE },
  pointerWorld: { x: 0, y: 0 },
  draft: null,
  guides: [],
  clipboard: [],
  historyPast: [],
  historyFuture: [],
  autosaveStatus: "idle",
  selectedModuleId: "generic-mono-550",
  contextMenu: null,

  setDocument: (document, recordHistory = true) =>
    set((state) => (recordHistory ? withHistory(state, document, []) : { document: touch(document) })),
  newProject: () =>
    set((state) => withHistory(state, createBlankDocument(), [])),
  loadDemo: () =>
    set((state) => withHistory(state, createDemoDocument(), [])),
  setActiveTool: (activeTool) => set({ activeTool, draft: null, contextMenu: null }),
  setViewport: (viewport) => set({ viewport }),
  setPointerWorld: (pointerWorld) => set({ pointerWorld }),
  setDraft: (draft) => set({ draft }),
  setSnapMarker: (snapMarker) => set({ snapMarker }),
  setGuides: (guides) => set({ guides }),
  setSelectedModuleId: (selectedModuleId) => set({ selectedModuleId }),
  selectOnly: (id) => set({ selectedIds: id ? [id] : [], contextMenu: null }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
      contextMenu: null
    })),
  selectMany: (selectedIds) => set({ selectedIds, contextMenu: null }),
  clearSelection: () => set({ selectedIds: [], contextMenu: null }),
  addObjects: (objects, selectIds) =>
    set((state) =>
      withHistory(
        state,
        {
          ...state.document,
          objects: [...state.document.objects, ...objects].sort((a, b) => a.zIndex - b.zIndex)
        },
        selectIds ?? state.selectedIds
      )
    ),
  updateObject: (id, patch, recordHistory = true) =>
    set((state) => {
      const nextObjects = state.document.objects.map((object) => {
        if (object.id !== id || !canModify(object, state.document.layers)) return object;
        return { ...object, ...patch } as CadObject;
      });
      const nextDocument = { ...state.document, objects: markPanelRoofWarnings(nextObjects) };
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  replaceObject: (replacement, recordHistory = true) =>
    set((state) => {
      const nextDocument = {
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) => (object.id === replacement.id && canModify(object, state.document.layers) ? replacement : object))
        )
      };
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  translateObjects: (ids, dx, dy, recordHistory = true) =>
    set((state) => {
      const nextDocument = {
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) =>
            ids.includes(object.id) && canModify(object, state.document.layers) ? translateObject(object, dx, dy) : object
          )
        )
      };
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  applyDragFromOriginals: (originals, dx, dy, recordHistory = false) =>
    set((state) => {
      const originalsById = new Map(originals.map((object) => [object.id, object]));
      const nextDocument = {
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) => {
            const original = originalsById.get(object.id);
            return original && canModify(object, state.document.layers) ? translateObject(original, dx, dy) : object;
          })
        )
      };
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  deleteSelected: () =>
    set((state) => {
      const deletable = new Set(
        state.document.objects.filter((object) => state.selectedIds.includes(object.id) && canModify(object, state.document.layers)).map((object) => object.id)
      );
      if (deletable.size === 0) return {};
      return withHistory(
        state,
        { ...state.document, objects: state.document.objects.filter((object) => !deletable.has(object.id)) },
        []
      );
    }),
  copySelected: () =>
    set((state) => ({
      clipboard: state.document.objects.filter((object) => state.selectedIds.includes(object.id))
    })),
  paste: () =>
    set((state) => {
      if (state.clipboard.length === 0) return {};
      const clones = state.clipboard.map((object) => cloneObject(object));
      return withHistory(state, { ...state.document, objects: [...state.document.objects, ...clones] }, clones.map((object) => object.id));
    }),
  duplicateSelected: () => {
    get().copySelected();
    get().paste();
  },
  undo: () =>
    set((state) => {
      const previous = state.historyPast.at(-1);
      if (!previous) return {};
      return {
        document: previous,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [state.document, ...state.historyFuture],
        selectedIds: []
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) return {};
      return {
        document: next,
        historyFuture: state.historyFuture.slice(1),
        historyPast: [...state.historyPast, state.document],
        selectedIds: []
      };
    }),
  pushHistory: () =>
    set((state) => ({
      historyPast: [...state.historyPast, state.document].slice(-80),
      historyFuture: []
    })),
  setLayer: (layerId, patch) =>
    set((state) =>
      {
        const layers = state.document.layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer));
        const activeLayerId = chooseActiveLayer(layers, state.document.settings.activeLayerId);
        const selectedIds =
          patch.visible === false || patch.locked === true
            ? state.selectedIds.filter((id) => state.document.objects.find((object) => object.id === id)?.layerId !== layerId)
            : state.selectedIds;
        return withHistory(
          state,
          {
            ...state.document,
            layers,
            settings: { ...state.document.settings, activeLayerId }
          },
          selectedIds
        );
      }
    ),
  setActiveLayer: (activeLayerId) =>
    set((state) => {
      const layer = state.document.layers.find((item) => item.id === activeLayerId);
      if (!layer?.visible || layer.locked) {
        return {
          document: {
            ...state.document,
            settings: { ...state.document.settings, activeLayerId: chooseActiveLayer(state.document.layers, state.document.settings.activeLayerId) }
          }
        };
      }
      return {
        document: {
          ...state.document,
          settings: { ...state.document.settings, activeLayerId }
        }
      };
    }),
  setAutosaveStatus: (autosaveStatus) => set({ autosaveStatus }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  bringForward: (ids) =>
    set((state) =>
      withHistory(state, {
        ...state.document,
        objects: state.document.objects.map((object) =>
          ids.includes(object.id) ? { ...object, zIndex: object.zIndex + 1 } : object
        ).sort((a, b) => a.zIndex - b.zIndex)
      })
    ),
  sendBackward: (ids) =>
    set((state) =>
      withHistory(state, {
        ...state.document,
        objects: state.document.objects.map((object) =>
          ids.includes(object.id) ? { ...object, zIndex: object.zIndex - 1 } : object
        ).sort((a, b) => a.zIndex - b.zIndex)
      })
    ),
  lockObjects: (ids, locked) =>
    set((state) =>
      withHistory(state, {
        ...state.document,
        objects: state.document.objects.map((object) => (ids.includes(object.id) ? { ...object, locked } : object))
      })
    )
}));

function markPanelRoofWarnings(objects: CadObject[]): CadObject[] {
  const roofs = objects.filter((object): object is Extract<CadObject, { type: "roof" }> => object.type === "roof");
  return objects.map((object) => {
    if (object.type !== "solarPanel") return object;
    return roofContainsPanel(object, roofs) ? { ...object, warning: undefined } : { ...object, warning: "Panel outside roof boundary" };
  });
}

function chooseActiveLayer(layers: CadLayer[], currentLayerId: string) {
  const current = layers.find((layer) => layer.id === currentLayerId);
  if (current?.visible && !current.locked) return currentLayerId;
  return layers.find((layer) => layer.visible && !layer.locked)?.id ?? currentLayerId;
}

export function selectedSolarStats(objects: CadObject[], selectedIds: string[]) {
  const panels = objects.filter((object): object is SolarPanelObject => object.type === "solarPanel" && selectedIds.includes(object.id));
  return calculateArrayStats(panels);
}
