import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { useCadStore } from "../../store/useCadStore";
import type { CadObject, Point, SolarPanelObject } from "../../types/cad";
import { clampScale, screenToWorld, zoomAroundPoint } from "../../cad/viewport/viewport";
import { getBoundingBox, rectanglesOverlap, panelOverlapsExisting } from "../../cad/geometry/geometry";
import { calculateSnap, snapPanelToPanels, snapToGrid } from "../../cad/snapping/snapping";
import { sampleSolarModules } from "../../data/sampleSolarModules";
import {
  createCircle,
  createDimension,
  createLine,
  createPolygon,
  createRectangle,
  createRoof,
  createSolarPanel,
  createText,
  nextZ
} from "../../cad/objects/factory";
import { GridLayer } from "./GridLayer";
import { DraftLayer } from "./DraftLayer";
import { CadObjectRenderer } from "./renderers/CadObjectRenderer";

interface Props {
  stageRef: RefObject<Konva.Stage>;
  readOnly?: boolean;
}

export function CadCanvas({ stageRef, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodesRef = useRef<Record<string, Konva.Node | null>>({});
  const dragOriginalsRef = useRef<CadObject[]>([]);
  const marqueeStartRef = useRef<Point | null>(null);
  const panStartRef = useRef<{ pointer: Point; viewport: { x: number; y: number; scale: number } } | null>(null);
  const spaceDownRef = useRef(false);
  const [size, setSize] = useState({ width: 900, height: 650 });
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);

  const {
    document,
    selectedIds,
    activeTool,
    viewport,
    draft,
    guides,
    snapMarker,
    selectedModuleId,
    setViewport,
    setPointerWorld,
    setDraft,
    setSnapMarker,
    setGuides,
    selectOnly,
    toggleSelect,
    selectMany,
    clearSelection,
    addObjects,
    updateObject,
    replaceObject,
    applyDragFromOriginals,
    setContextMenu,
    showToast
  } = useCadStore();
  const viewportRef = useRef(viewport);
  const pendingWheelViewportRef = useRef<typeof viewport | null>(null);
  const wheelFrameRef = useRef<number | null>(null);

  const layersById = useMemo(() => new Map(document.layers.map((layer) => [layer.id, layer])), [document.layers]);
  const visibleObjects = useMemo(
    () =>
      document.objects
        .filter((object) => object.visible && layersById.get(object.layerId)?.visible)
        .sort((a, b) => a.zIndex - b.zIndex),
    [document.objects, layersById]
  );

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height)
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const nodes = selectedIds
      .filter((id) => {
        const object = document.objects.find((item) => item.id === id);
        return object ? object.type !== "mapImage" && canInteractWithObject(object, layersById) && (readOnly || object.layerId === document.settings.activeLayerId) : false;
      })
      .map((id) => nodesRef.current[id])
      .filter(Boolean) as Konva.Node[];
    transformerRef.current?.nodes(nodes);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedIds, document.objects, layersById, document.settings.activeLayerId, readOnly]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space") {
        spaceDownRef.current = true;
        event.preventDefault();
      }
      if (event.key === "Escape") {
        if (draft) setDraft(null);
        else clearSelection();
        setGuides([]);
        return;
      }
      if (event.key === "Enter" && draft?.type === "polygon" && draft.points.length >= 3) {
        finishPolygonDraft();
        return;
      }
      if (readOnly) return;
      if (event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const shortcuts: Record<string, typeof activeTool> = {
        v: "select",
        f: "roof",
        p: "solar",
        t: "text"
      };
      if (shortcuts[key]) {
        useCadStore.getState().setActiveTool(shortcuts[key]);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDownRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [draft, readOnly, setDraft, clearSelection, setGuides]);

  const getPointer = (): Point | null => {
    const pointer = stageRef.current?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  };

  const snapPointer = (world: Point, excludeIds: string[] = []) => {
    const snap = calculateSnap(world, visibleObjects, document.settings.snap, document.settings.grid.minor, viewport, excludeIds);
    setSnapMarker(snap.marker);
    return snap.point;
  };

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = getPointer();
    if (!pointer) return;
    const baseViewport = pendingWheelViewportRef.current ?? viewportRef.current;
    const factor = Math.exp(-event.evt.deltaY * 0.0014);
    const nextViewport = zoomAroundPoint(baseViewport, pointer, clampScale(baseViewport.scale * factor));
    pendingWheelViewportRef.current = nextViewport;
    viewportRef.current = nextViewport;

    stageRef.current?.position({ x: nextViewport.x, y: nextViewport.y });
    stageRef.current?.scale({ x: nextViewport.scale, y: nextViewport.scale });
    stageRef.current?.batchDraw();

    if (wheelFrameRef.current === null) {
      wheelFrameRef.current = requestAnimationFrame(() => {
        const pending = pendingWheelViewportRef.current;
        pendingWheelViewportRef.current = null;
        wheelFrameRef.current = null;
        if (pending) setViewport(pending);
      });
    }
  };

  const handleMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const pointer = getPointer();
    if (!pointer) return;
    const isStage = event.target === event.target.getStage();
    const rawWorld = screenToWorld(pointer, viewport);
    const world = snapPointer(rawWorld);
    setContextMenu(null);

    if (event.evt.button === 1 || activeTool === "pan" || spaceDownRef.current) {
      panStartRef.current = { pointer, viewport };
      return;
    }

    if (readOnly) {
      if (isStage) {
        if (!event.evt.shiftKey) clearSelection();
        marqueeStartRef.current = world;
        setMarquee({ start: world, current: world });
      }
      return;
    }

    if (activeTool === "solar") {
      const module = sampleSolarModules.find((item) => item.id === selectedModuleId) ?? sampleSolarModules[0];
      const point = document.settings.snap.grid ? snapToGrid(world, document.settings.grid.minor) : world;
      const panel = createSolarPanel(point, module, getPreferredLayerId("solar", document.settings.activeLayerId, document.layers), nextZ(document.objects));
      const existingPanels = document.objects.filter((o): o is SolarPanelObject => o.type === "solarPanel");
      if (panelOverlapsExisting(panel, existingPanels)) {
        showToast("Cannot place panel here — space is occupied");
        return;
      }
      addObjects([panel], [panel.id]);
      return;
    }

    if (!isStage) return;

    if (activeTool === "select") {
      if (!event.evt.shiftKey) clearSelection();
      marqueeStartRef.current = world;
      setMarquee({ start: world, current: world });
      return;
    }

    if (activeTool === "text") {
      const text = window.prompt("Text", "Annotation");
      if (text?.trim()) {
        addObjects([createText(world, text.trim(), document.settings.activeLayerId, nextZ(document.objects))], []);
      }
      return;
    }

    if (!draft) {
      if (activeTool === "line") setDraft({ type: "line", start: world, current: world });
      if (activeTool === "rectangle") setDraft({ type: "rectangle", start: world, current: world });
      if (activeTool === "circle") setDraft({ type: "circle", center: world, current: world });
      if (activeTool === "polygon") setDraft({ type: "polygon", points: [world], current: world, roof: false });
      if (activeTool === "roof") setDraft({ type: "polygon", points: [world], current: world, roof: true });
      if (activeTool === "dimension") setDraft({ type: "dimension", start: world, current: world });
      if (activeTool === "measure") setDraft({ type: "measure", start: world, current: world });
      return;
    }

    if (draft.type === "line") {
      const line = createLine(draft.start, world, document.settings.activeLayerId, nextZ(document.objects));
      addObjects([line], [line.id]);
      setDraft(null);
    } else if (draft.type === "rectangle") {
      const rectangle = createRectangle(draft.start, world, document.settings.activeLayerId, nextZ(document.objects));
      addObjects([rectangle], [rectangle.id]);
      setDraft(null);
    } else if (draft.type === "circle") {
      const circle = createCircle(draft.center, world, document.settings.activeLayerId, nextZ(document.objects));
      addObjects([circle], [circle.id]);
      setDraft(null);
    } else if (draft.type === "dimension") {
      const dimension = createDimension(draft.start, world, "dimensions", nextZ(document.objects));
      addObjects([dimension], [dimension.id]);
      setDraft(null);
    } else if (draft.type === "measure") {
      setDraft(null);
    } else if (draft.type === "polygon") {
      if (draft.roof && draft.points.length >= 3 && isNearPoint(rawWorld, draft.points[0], viewport)) {
        finishPolygonDraft();
        return;
      }
      const pointToAdd = draft.roof ? draft.current : world;
      setDraft({ ...draft, points: [...draft.points, pointToAdd], current: pointToAdd });
    }
  };

  const handleMouseMove = () => {
    const pointer = getPointer();
    if (!pointer) return;
    if (dragOriginalsRef.current.length > 0) return;
    const worldRaw = screenToWorld(pointer, viewport);
    const world = snapPointer(worldRaw);
    setPointerWorld(world);

    if (panStartRef.current) {
      const dx = pointer.x - panStartRef.current.pointer.x;
      const dy = pointer.y - panStartRef.current.pointer.y;
      setViewport({
        ...panStartRef.current.viewport,
        x: panStartRef.current.viewport.x + dx,
        y: panStartRef.current.viewport.y + dy
      });
      return;
    }

    if (marqueeStartRef.current) {
      setMarquee({ start: marqueeStartRef.current, current: worldRaw });
    }

    if (!draft) return;
    if (draft.type === "line") setDraft({ ...draft, current: world });
    if (draft.type === "rectangle") setDraft({ ...draft, current: world });
    if (draft.type === "circle") setDraft({ ...draft, current: world });
    if (draft.type === "polygon") {
      const constrained = draft.roof ? constrainRoofSegment(draft.points[draft.points.length - 1], world, viewport, draft.points) : world;
      const current = draft.roof && draft.points.length >= 3 && isNearPoint(worldRaw, draft.points[0], viewport) ? draft.points[0] : constrained;
      setDraft({ ...draft, current });
    }
    if (draft.type === "dimension" || draft.type === "measure") setDraft({ ...draft, current: world });
  };

  const handleMouseUp = () => {
    if (panStartRef.current) panStartRef.current = null;
    if (marquee && (activeTool === "select" || readOnly)) {
      const box = marqueeBox(marquee.start, marquee.current);
      const ids = visibleObjects
        .filter((object) => readOnly || object.layerId === document.settings.activeLayerId)
        .filter((object) => rectanglesOverlap(getBoundingBox(object), box))
        .map((object) => object.id);
      if (ids.length) selectMany(ids);
      setMarquee(null);
      marqueeStartRef.current = null;
    }
  };

  const finishPolygonDraft = () => {
    const currentDraft = useCadStore.getState().draft;
    if (!currentDraft || currentDraft.type !== "polygon" || currentDraft.points.length < 3) return;
    const points = currentDraft.points;
    const object = currentDraft.roof
      ? createRoof(points, nextZ(document.objects))
      : createPolygon(points, document.settings.activeLayerId, nextZ(document.objects));
    addObjects([object], [object.id]);
    setDraft(null);
  };

  const handleObjectSelect = (id: string, additive: boolean) => {
    if (activeTool !== "select" && !readOnly) return;
    const object = document.objects.find((item) => item.id === id);
    if (!object || (!readOnly && object.layerId !== document.settings.activeLayerId)) return;
    if (additive) toggleSelect(id);
    else selectOnly(id);
  };

  const handleDragStart = (id: string) => {
    setGuides([]);
    setSnapMarker(undefined);
    // Selecting + dragging should happen in one gesture: claim the object being dragged
    if (!selectedIds.includes(id)) selectOnly(id);
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    dragOriginalsRef.current = document.objects.filter((object) => ids.includes(object.id) && canInteractWithObject(object, layersById));
    if (dragOriginalsRef.current.length === 0) {
      dragOriginalsRef.current = document.objects.filter((object) => object.id === id && canInteractWithObject(object, layersById));
    }
  };

  const handleDragMove = (id: string, node: Konva.Node) => {
    const originals = dragOriginalsRef.current;
    const object = originals.find((item) => item.id === id);
    if (!object) return;
    const ids = originals.map((item) => item.id);
    let dx = node.x() - object.x;
    let dy = node.y() - object.y;

    if (object.type === "solarPanel" && ids.length === 1 && document.settings.snap.enabled && document.settings.snap.alignment) {
      const candidate: SolarPanelObject = { ...object, x: node.x(), y: node.y() };
      const snapped = snapPanelToPanels(candidate, document.objects, viewport, document.settings.snap.tolerancePx, ids);
      dx = snapped.x - object.x;
      dy = snapped.y - object.y;
      node.position({ x: snapped.x, y: snapped.y });
    }

    for (const original of originals) {
      if (original.id === id) continue;
      nodesRef.current[original.id]?.position({ x: original.x + dx, y: original.y + dy });
    }
    stageRef.current?.batchDraw();
  };

  const handleDragEnd = (id: string, node: Konva.Node) => {
    const originals = dragOriginalsRef.current;
    const object = originals.find((item) => item.id === id);
    if (object && originals.length > 0) {
      let dx = node.x() - object.x;
      let dy = node.y() - object.y;
      if (object.type === "solarPanel" && originals.length === 1 && document.settings.snap.enabled && document.settings.snap.alignment) {
        const snapped = snapPanelToPanels({ ...object, x: node.x(), y: node.y() }, document.objects, viewport, document.settings.snap.tolerancePx, [id]);
        dx = snapped.x - object.x;
        dy = snapped.y - object.y;
        node.position({ x: snapped.x, y: snapped.y });
      }
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        applyDragFromOriginals(originals, dx, dy, true);
      }
    }
    dragOriginalsRef.current = [];
    setGuides([]);
    setSnapMarker(undefined);
  };

  const handleTransformEnd = (id: string, node: Konva.Node) => {
    const object = document.objects.find((item) => item.id === id);
    if (!object) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });

    if (object.type === "rectangle" || object.type === "solarPanel" || object.type === "mapImage") {
      updateObject(id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(20, object.width * Math.abs(scaleX)),
        height: Math.max(20, object.height * Math.abs(scaleY)),
        rotation: node.rotation()
      } as Partial<CadObject>);
    } else if (object.type === "circle") {
      updateObject(id, {
        x: node.x(),
        y: node.y(),
        radius: Math.max(20, object.radius * Math.max(Math.abs(scaleX), Math.abs(scaleY))),
        rotation: node.rotation()
      } as Partial<CadObject>);
    } else if (object.type === "text") {
      updateObject(id, {
        x: node.x(),
        y: node.y(),
        fontSize: Math.max(40, object.fontSize * Math.max(Math.abs(scaleX), Math.abs(scaleY))),
        rotation: node.rotation()
      } as Partial<CadObject>);
    } else {
      replaceObject({ ...object, x: node.x(), y: node.y(), rotation: node.rotation() });
    }
  };

  const canvasCursor = readOnly
    ? "default"
    : activeTool === "pan" || spaceDownRef.current
      ? "grab"
      : activeTool === "select"
        ? "default"
        : activeTool === "text"
          ? "text"
          : "crosshair";

  return (
    <div ref={containerRef} className="canvas-shell" style={{ cursor: canvasCursor }}>
      <div className="ruler ruler-horizontal">{renderRulerLabels(viewport, size.width, true)}</div>
      <div className="ruler ruler-vertical">{renderRulerLabels(viewport, size.height, false)}</div>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={finishPolygonDraft}
        onContextMenu={(event) => {
          event.evt.preventDefault();
          const pointer = getPointer();
          if (!pointer) return;
          const hitId = selectedIds[0];
          if (hitId) setContextMenu({ x: pointer.x, y: pointer.y, ids: selectedIds });
        }}
      >
        <Layer listening={false}>
          <GridLayer width={size.width} height={size.height} viewport={viewport} grid={document.settings.grid} />
        </Layer>
        <Layer>
          {visibleObjects.map((object) => {
            const layer = layersById.get(object.layerId);
            const locked = object.locked || layer?.locked;
            const isMapImage = object.type === "mapImage";
            return (
              <CadObjectRenderer
                key={object.id}
                object={object}
                selected={!isMapImage && selectedIds.includes(object.id)}
                draggable={!isMapImage && !readOnly && activeTool === "select" && !locked}
                listening={!isMapImage && (readOnly || activeTool !== "select" || object.layerId === document.settings.activeLayerId)}
                scale={viewport.scale}
                registerNode={(id, node) => {
                  nodesRef.current[id] = node;
                }}
                onSelect={handleObjectSelect}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
              />
            );
          })}
        </Layer>
        <Layer listening={false}>
          <DraftLayer draft={draft} guides={guides} marker={snapMarker} viewport={viewport} />
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.current.x)}
              y={Math.min(marquee.start.y, marquee.current.y)}
              width={Math.abs(marquee.current.x - marquee.start.x)}
              height={Math.abs(marquee.current.y - marquee.start.y)}
              fill="rgba(242, 140, 40, 0.08)"
              stroke="#f28c28"
              strokeWidth={2 / viewport.scale}
              dash={[50, 35]}
            />
          )}
        </Layer>
        <Layer>
          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio={false}
            ignoreStroke
            boundBoxFunc={(_, nextBox) => ({
              ...nextBox,
              width: Math.max(20, Math.abs(nextBox.width)),
              height: Math.max(20, Math.abs(nextBox.height))
            })}
            anchorStroke="#f28c28"
            borderStroke="#f28c28"
            anchorFill="#ffffff"
            anchorSize={10}
          />
        </Layer>
      </Stage>
    </div>
  );
}

function marqueeBox(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function canInteractWithObject(object: CadObject, layersById: Map<string, { visible: boolean; locked: boolean }>) {
  const layer = layersById.get(object.layerId);
  return object.visible && Boolean(layer?.visible) && !object.locked && !layer?.locked;
}

function isNearPoint(point: Point, target: Point, viewport: { scale: number }) {
  return Math.hypot(point.x - target.x, point.y - target.y) <= Math.max(120, 14 / viewport.scale);
}

function constrainRoofSegment(start: Point, current: Point, viewport: { scale: number }, points: Point[]): Point {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const threshold = Math.max(180, 18 / viewport.scale);
  const dotThreshold = Math.max(260, 26 / viewport.scale);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return current;
  const alignedDot = points
    .filter((point) => point !== start)
    .map((point) => {
      const horizontal = Math.abs(point.y - start.y) <= 0.001 && Math.abs(current.y - point.y) <= dotThreshold;
      const vertical = Math.abs(point.x - start.x) <= 0.001 && Math.abs(current.x - point.x) <= dotThreshold;
      const closeness = Math.min(Math.abs(current.x - point.x), Math.abs(current.y - point.y));
      return { point, horizontal, vertical, closeness };
    })
    .filter((candidate) => candidate.horizontal || candidate.vertical)
    .sort((a, b) => a.closeness - b.closeness)[0];
  if (alignedDot?.horizontal) return { x: current.x, y: alignedDot.point.y };
  if (alignedDot?.vertical) return { x: alignedDot.point.x, y: current.y };
  if (Math.abs(dy) <= threshold) return { x: current.x, y: start.y };
  if (Math.abs(dx) <= threshold) return { x: start.x, y: current.y };
  return current;
}

function getPreferredLayerId(
  preferredLayerId: string,
  fallbackLayerId: string,
  layers: Array<{ id: string; visible: boolean; locked: boolean }>
) {
  const preferred = layers.find((layer) => layer.id === preferredLayerId);
  if (preferred?.visible && !preferred.locked) return preferredLayerId;
  const fallback = layers.find((layer) => layer.id === fallbackLayerId);
  if (fallback?.visible && !fallback.locked) return fallbackLayerId;
  return layers.find((layer) => layer.visible && !layer.locked)?.id ?? preferredLayerId;
}

function renderRulerLabels(viewport: { x: number; y: number; scale: number }, length: number, horizontal: boolean) {
  const labels = [];
  const step = chooseRulerStep(viewport.scale);
  const start = horizontal ? -viewport.x / viewport.scale : -viewport.y / viewport.scale;
  const first = Math.floor(start / step) * step;
  for (let value = first; value < start + length / viewport.scale; value += step) {
    const px = value * viewport.scale + (horizontal ? viewport.x : viewport.y);
    labels.push(
      <span key={value} style={horizontal ? { left: px } : { top: px }}>
        {value / 1000}m
      </span>
    );
  }
  return labels;
}

function chooseRulerStep(scale: number) {
  const steps = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  return steps.find((step) => step * scale >= 72) ?? steps[steps.length - 1];
}
