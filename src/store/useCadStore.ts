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
  SubarrayConfig,
  SubarrayRackingType,
  Viewport
} from "../types/cad";
import { createBlankDocument, createDemoDocument } from "../cad/document/defaultDocument";
import { DEFAULT_SCALE } from "../cad/viewport/viewport";
import { calculateArrayStats } from "../cad/array/array";
import { translateObject, validatePanelPlacement } from "../cad/geometry/geometry";
import { ensureSiteModel } from "../cad/site/siteModel";

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
  setProjectName: (name: string) => void;
  newProject: () => void;
  loadDemo: () => void;
  setActiveTool: (tool: CadTool) => void;
  setViewport: (viewport: Viewport) => void;
  setPointerWorld: (point: Point) => void;
  setDraft: (draft: DraftState) => void;
  setGuides: (guides: SnapGuide[]) => void;
  setSnapMarker: (marker?: SnapMarker) => void;
  setSelectedModuleId: (id: string) => void;
  selectOnly: (id?: string) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  addObjects: (objects: CadObject[], selectIds?: string[], subarray?: SubarrayConfig) => void;
  updateObject: (id: string, patch: Partial<CadObject>, recordHistory?: boolean) => void;
  batchUpdateObjects: (patches: { id: string; patch: Partial<CadObject> }[], recordHistory?: boolean) => void;
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
  createSubarray: (name: string, rackingType?: SubarrayRackingType, rackTiltDeg?: number, roofId?: string) => SubarrayConfig;
  addSubarrayConfig: (subarray: SubarrayConfig) => void;
  deleteSubarray: (subarrayId: string, deletePanels?: boolean) => void;
  assignPanelsToSubarray: (panelIds: string[], subarrayId: string) => void;
  selectSubarray: (subarrayId: string) => void;
  toast: string;
  showToast: (message: string) => void;
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
  viewport: { x: 320, y: 120, scale: DEFAULT_SCALE },
  pointerWorld: { x: 0, y: 0 },
  draft: null,
  guides: [],
  clipboard: [],
  historyPast: [],
  historyFuture: [],
  autosaveStatus: "idle",
  selectedModuleId: "generic-mono-550",
  contextMenu: null,
  toast: "",

  setDocument: (document, recordHistory = true) =>
    set((state) => {
      const normalized = ensureSiteModel(document);
      return recordHistory ? withHistory(state, normalized, []) : { document: touch(normalized) };
    }),
  setProjectName: (name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === state.document.name) return {};
      return withHistory(state, { ...state.document, name: trimmed });
    }),
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
  selectMany: (selectedIds: string[]) => set({ selectedIds, contextMenu: null }),
  setSelectedIds: (selectedIds: string[]) => set({ selectedIds, contextMenu: null }),
  clearSelection: () => set({ selectedIds: [], contextMenu: null }),
  addObjects: (objects, selectIds, subarray) =>
    set((state) => {
      const currentSubarrays = state.document.subarrays || [];
      const updatedSubarrays =
        subarray && !currentSubarrays.some((s) => s.id === subarray.id)
          ? [...currentSubarrays, subarray]
          : currentSubarrays;
      return withHistory(
        state,
        ensureSiteModel({
          ...state.document,
          subarrays: updatedSubarrays,
          objects: markPanelRoofWarnings([...state.document.objects, ...objects]).sort((a, b) => a.zIndex - b.zIndex)
        }),
        selectIds ?? state.selectedIds
      );
    }),
  updateObject: (id, patch, recordHistory = true) =>
    set((state) => {
      const nextObjects = state.document.objects.map((object) => {
        if (object.id !== id || !canModify(object, state.document.layers)) return object;
        return { ...object, ...patch } as CadObject;
      });
      const nextDocument = ensureSiteModel({ ...state.document, objects: markPanelRoofWarnings(nextObjects) });
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  batchUpdateObjects: (patches, recordHistory = true) =>
    set((state) => {
      const patchMap = new Map(patches.map(({ id, patch }) => [id, patch]));
      const nextObjects = state.document.objects.map((object) => {
        const patch = patchMap.get(object.id);
        if (!patch || !canModify(object, state.document.layers)) return object;
        return { ...object, ...patch } as CadObject;
      });
      const nextDocument = ensureSiteModel({ ...state.document, objects: markPanelRoofWarnings(nextObjects) });
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  replaceObject: (replacement, recordHistory = true) =>
    set((state) => {
      const nextDocument = ensureSiteModel({
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) => (object.id === replacement.id && canModify(object, state.document.layers) ? replacement : object))
        )
      });
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  translateObjects: (ids, dx, dy, recordHistory = true) =>
    set((state) => {
      const nextDocument = ensureSiteModel({
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) =>
            ids.includes(object.id) && canModify(object, state.document.layers) ? translateObject(object, dx, dy) : object
          )
        )
      });
      return recordHistory ? withHistory(state, nextDocument) : { document: touch(nextDocument) };
    }),
  applyDragFromOriginals: (originals, dx, dy, recordHistory = false) =>
    set((state) => {
      const originalsById = new Map(originals.map((object) => [object.id, object]));
      const nextDocument = ensureSiteModel({
        ...state.document,
        objects: markPanelRoofWarnings(
          state.document.objects.map((object) => {
            const original = originalsById.get(object.id);
            return original && canModify(object, state.document.layers) ? translateObject(original, dx, dy) : object;
          })
        )
      });
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
        ensureSiteModel({ ...state.document, objects: state.document.objects.filter((object) => !deletable.has(object.id)) }),
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
      return withHistory(
        state,
        ensureSiteModel({ ...state.document, objects: markPanelRoofWarnings([...state.document.objects, ...clones]) }),
        clones.map((object) => object.id)
      );
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
    ),
  createSubarray: (name, rackingType = "flush", rackTiltDeg, roofId) => {
    const newSubarray: SubarrayConfig = {
      id: `subarray-${Date.now()}`,
      name: name.trim() || "Subarray",
      rackingType,
      rackTiltDeg,
      roofId
    };
    set((state) => {
      const current = state.document.subarrays || [];
      const nextDocument = {
        ...state.document,
        subarrays: [...current, newSubarray]
      };
      return withHistory(state, nextDocument);
    });
    return newSubarray;
  },
  addSubarrayConfig: (subarray) =>
    set((state) => {
      const current = state.document.subarrays || [];
      if (current.some((s) => s.id === subarray.id)) return {};
      const nextDocument = {
        ...state.document,
        subarrays: [...current, subarray]
      };
      return withHistory(state, nextDocument);
    }),
  deleteSubarray: (subarrayId, deletePanels = false) =>
    set((state) => {
      const nextSubarrays = (state.document.subarrays || []).filter((s) => s.id !== subarrayId);
      let nextObjects = state.document.objects;
      if (deletePanels) {
        nextObjects = nextObjects.filter((o) => !(o.type === "solarPanel" && o.subarrayId === subarrayId));
      } else {
        nextObjects = nextObjects.map((o) =>
          o.type === "solarPanel" && o.subarrayId === subarrayId ? { ...o, subarrayId: undefined } : o
        );
      }
      const nextDocument = { ...state.document, subarrays: nextSubarrays, objects: markPanelRoofWarnings(nextObjects) };
      return withHistory(state, nextDocument, state.selectedIds.filter((id) => nextObjects.some((o) => o.id === id)));
    }),
  assignPanelsToSubarray: (panelIds, subarrayId) =>
    set((state) => {
      const nextObjects = state.document.objects.map((o) =>
        o.type === "solarPanel" && panelIds.includes(o.id) ? { ...o, subarrayId } : o
      );
      const nextDocument = { ...state.document, objects: nextObjects };
      return withHistory(state, nextDocument);
    }),
  selectSubarray: (subarrayId) => {
    const panels = get().document.objects.filter(
      (o) => o.type === "solarPanel" && o.subarrayId === subarrayId
    );
    set({ selectedIds: panels.map((p) => p.id) });
  },
  showToast: (message) => {
    set({ toast: message });
    setTimeout(() => set({ toast: "" }), 3000);
  }
}));

function markPanelRoofWarnings(objects: CadObject[]): CadObject[] {
  const roofs = objects.filter((object): object is Extract<CadObject, { type: "roof" }> => object.type === "roof");
  const obstructions = objects.filter((object): object is Extract<CadObject, { type: "obstruction" }> => object.type === "obstruction");
  const restrictedZones = objects.filter((object): object is Extract<CadObject, { type: "restrictedZone" }> => object.type === "restrictedZone");
  const panels = objects.filter((object): object is Extract<CadObject, { type: "solarPanel" }> => object.type === "solarPanel");
  return objects.map((object) => {
    if (object.type !== "solarPanel") return object;
    const result = validatePanelPlacement(object, {
      roofs,
      existingPanels: panels,
      obstructions,
      restrictedZones
    });
    return result.valid ? { ...object, warning: undefined } : { ...object, warning: panelWarningText(result.reasons) };
  });
}

function panelWarningText(reasons: string[]) {
  if (reasons.includes("PANEL_OVERLAP")) return "Panel overlaps another module";
  if (reasons.includes("OBSTRUCTION_COLLISION")) return "Panel conflicts with obstruction clearance";
  if (reasons.includes("RESTRICTED_ZONE")) return "Panel conflicts with restricted zone";
  if (reasons.includes("SETBACK_VIOLATION")) return "Panel crosses setback clearance";
  if (reasons.includes("INVALID_ROOF")) return "Roof geometry is invalid";
  return "Panel outside roof boundary";
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
