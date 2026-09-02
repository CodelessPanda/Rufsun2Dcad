import { Arrow, Circle, Group, Image as KonvaImage, Label, Line, Rect, Tag, Text } from "react-konva";
import type Konva from "konva";
import { useEffect, useState } from "react";
import type { CadObject, CircleObject, DimensionObject, EquipmentObject, LineObject, MapImageObject, ObstructionObject, PolygonObject, RectangleObject, RestrictedZoneObject, RoofObject, TextObject, VegetationObject } from "../../../types/cad";
import { distance, formatFeetInches, formatMetric, midpoint, polygonArea, roofUsablePolygon } from "../../../cad/geometry/geometry";
import { googleStaticMapUrl } from "../../../services/googleMaps";

interface SharedProps<T extends CadObject> {
  object: T;
  selected: boolean;
  draggable: boolean;
  listening: boolean;
  scale: number;
  registerNode: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (id: string, node: Konva.Node) => void;
  onDragMove: (id: string, node: Konva.Node) => void;
  onDragEnd: (id: string, node: Konva.Node) => void;
  onTransformEnd: (id: string, node: Konva.Node) => void;
}

function shared<T extends CadObject>(props: SharedProps<T>) {
  return {
    id: `node-${props.object.id}`,
    ref: (node: Konva.Node | null) => props.registerNode(props.object.id, node),
    draggable: props.draggable,
    listening: props.listening,
    dragDistance: 4,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
      props.onSelect(props.object.id, event.evt.shiftKey);
    },
    onTap: (event: Konva.KonvaEventObject<Event>) => {
      event.cancelBubble = true;
      props.onSelect(props.object.id, false);
    },
    onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => props.onDragStart(props.object.id, event.target),
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => props.onDragMove(props.object.id, event.target),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => props.onDragEnd(props.object.id, event.target),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => props.onTransformEnd(props.object.id, event.target)
  };
}

export function LineRenderer(props: SharedProps<LineObject>) {
  const { object, selected, scale } = props;
  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      <Line
        points={[0, 0, object.x2 - object.x, object.y2 - object.y]}
        stroke={selected ? "#f28c28" : object.stroke}
        strokeWidth={(selected ? 5 : 3) / scale}
        hitStrokeWidth={16 / scale}
      />
    </Group>
  );
}

export function RectangleRenderer(props: SharedProps<RectangleObject | EquipmentObject>) {
  const { object, selected, scale } = props;
  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      <Rect
        width={object.width}
        height={object.height}
        fill={object.fill}
        stroke={selected ? "#f28c28" : object.stroke}
        strokeWidth={(selected ? 5 : 3) / scale}
      />
    </Group>
  );
}

export function MapImageRenderer(props: SharedProps<MapImageObject>) {
  const { object, selected, scale } = props;
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const apiKey = localStorage.getItem("rufsun.googleMapsApiKey") ?? "";
    if (!apiKey) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = googleStaticMapUrl(object.capture, apiKey);
  }, [object.capture]);

  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      {image ? (
        <KonvaImage image={image} width={object.width} height={object.height} opacity={object.opacity} />
      ) : (
        <Rect width={object.width} height={object.height} fill="#e2e8f0" opacity={0.85} />
      )}
      <Rect
        width={object.width}
        height={object.height}
        stroke={selected ? "#f28c28" : "#315b8f"}
        strokeWidth={(selected ? 5 : 2) / scale}
        dash={selected ? undefined : [80, 50]}
        fill="transparent"
      />
      {!image && (
        <Text
          text="Add Google Maps API key in Settings to render map"
          x={40}
          y={40}
          width={Math.max(240, object.width - 80)}
          fill="#315b8f"
          fontSize={140}
          listening={false}
        />
      )}
    </Group>
  );
}

export function CircleRenderer(props: SharedProps<CircleObject | VegetationObject>) {
  const { object, selected, scale } = props;
  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      <Circle
        radius={object.radius}
        fill={object.fill}
        stroke={selected ? "#f28c28" : object.stroke}
        strokeWidth={(selected ? 5 : 3) / scale}
      />
    </Group>
  );
}

export function PolygonRenderer(props: SharedProps<PolygonObject | RoofObject | ObstructionObject | RestrictedZoneObject>) {
  const { object, selected, scale } = props;
  const flatPoints = object.points.flatMap((point) => [point.x - object.x, point.y - object.y]);
  const isRoof = object.type === "roof";
  const area = isRoof ? polygonArea(object.points) / 1_000_000 : 0;
  const roofLabel = isRoof
    ? (() => {
        const minX = Math.min(...object.points.map((p) => p.x));
        const minY = Math.min(...object.points.map((p) => p.y));
        return { x: minX - object.x, y: minY - object.y };
      })()
    : null;
  const setbackPoints =
    isRoof && object.setback > 0
      ? roofUsablePolygon(object).flatMap((point) => [point.x - object.x, point.y - object.y])
      : [];

  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      <Line
        points={flatPoints}
        closed
        fill={object.fill}
        stroke={selected ? "#f28c28" : object.stroke}
        strokeWidth={(selected ? 5 : 3) / scale}
      />
      {setbackPoints.length > 0 && (
        <Line points={setbackPoints} closed stroke="#16855f" dash={[80, 60]} strokeWidth={2 / scale} listening={false} />
      )}
      {isRoof && roofLabel && (
        <>
          <Label x={roofLabel.x} y={roofLabel.y - 16 / scale} listening={false}>
            <Tag fill="rgba(255,255,255,0.92)" stroke="#d7e4de" strokeWidth={1 / scale} cornerRadius={4 / scale} />
            <Text
              text={`${object.name}  Area: ${area.toFixed(1)} m²`}
              padding={4 / scale}
              fill="#155e47"
              fontSize={12 / scale}
              fontStyle="600"
            />
          </Label>
          {object.points.map((point, index) => {
            const next = object.points[(index + 1) % object.points.length];
            const center = midpoint(point, next);
            const labelPosition = offsetSegmentLabel(point, next, center, 12 / scale);
            return (
              <Label key={`${object.id}-edge-${index}`} x={labelPosition.x - object.x} y={labelPosition.y - object.y} listening={false}>
                <Tag fill="rgba(255,255,255,0.92)" stroke="#d7e4de" strokeWidth={1 / scale} cornerRadius={4 / scale} />
                <Text
                  text={formatFeetInches(distance(point, next))}
                  padding={4 / scale}
                  fill="#155e47"
                  fontSize={12 / scale}
                  fontStyle="600"
                />
              </Label>
            );
          })}
        </>
      )}
    </Group>
  );
}

function offsetSegmentLabel(start: { x: number; y: number }, end: { x: number; y: number }, center: { x: number; y: number }, offset: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    x: center.x + (-dy / length) * offset,
    y: center.y + (dx / length) * offset
  };
}

export function TextRenderer(props: SharedProps<TextObject>) {
  const { object, selected, scale } = props;
  return (
    <Group {...shared(props)} x={object.x} y={object.y} rotation={object.rotation}>
      <Text
        text={object.text}
        fontSize={object.fontSize}
        fill={selected ? "#f28c28" : object.color}
        padding={12}
        stroke={selected ? "#f28c28" : undefined}
        strokeWidth={selected ? 1 / scale : 0}
      />
    </Group>
  );
}

export function DimensionRenderer(props: SharedProps<DimensionObject>) {
  const { object, selected, scale } = props;
  const d = distance(object.start, object.end);
  const points = [0, 0, object.end.x - object.start.x, object.end.y - object.start.y];
  return (
    <Group {...shared(props)} x={object.start.x} y={object.start.y} rotation={object.rotation}>
      <Arrow
        points={points}
        pointerLength={90}
        pointerWidth={70}
        pointerAtBeginning
        stroke={selected ? "#f28c28" : "#315b8f"}
        fill={selected ? "#f28c28" : "#315b8f"}
        strokeWidth={3 / scale}
      />
      <Text
        text={formatMetric(d)}
        x={(object.end.x - object.start.x) / 2 - 260}
        y={(object.end.y - object.start.y) / 2 - 170}
        width={520}
        align="center"
        fill="#1e3a5f"
        fontSize={140}
        listening={false}
      />
    </Group>
  );
}
