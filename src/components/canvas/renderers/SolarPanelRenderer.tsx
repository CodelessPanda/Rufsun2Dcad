import { Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { SolarPanelObject } from "../../../types/cad";

interface Props {
  object: SolarPanelObject;
  selected: boolean;
  draggable: boolean;
  scale: number;
  registerNode: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (id: string, node: Konva.Node) => void;
  onDragMove: (id: string, node: Konva.Node) => void;
  onDragEnd: (id: string, node: Konva.Node) => void;
  onTransformEnd: (id: string, node: Konva.Node) => void;
}

export function SolarPanelRenderer({
  object,
  selected,
  draggable,
  scale,
  registerNode,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd
}: Props) {
  const cellColumns = object.orientation === "portrait" ? 6 : 12;
  const cellRows = object.orientation === "portrait" ? 12 : 6;
  const frame = Math.max(28, object.thickness);

  return (
    <Group
      id={`node-${object.id}`}
      ref={(node) => registerNode(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={draggable}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(object.id, event.evt.shiftKey);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(object.id, false);
      }}
      onContextMenu={(event) => event.cancelBubble = true}
      onDragStart={(event) => onDragStart(object.id, event.target)}
      onDragMove={(event) => onDragMove(object.id, event.target)}
      onDragEnd={(event) => onDragEnd(object.id, event.target)}
      onTransformEnd={(event) => onTransformEnd(object.id, event.target)}
    >
      <Rect
        width={object.width}
        height={object.height}
        fill="#141a21"
        stroke={selected ? "#f28c28" : "#c9d0d8"}
        strokeWidth={(selected ? 5 : 3) / scale}
        cornerRadius={18}
        shadowColor={selected ? "#f28c28" : "black"}
        shadowOpacity={selected ? 0.28 : 0.08}
        shadowBlur={selected ? 12 / scale : 4 / scale}
      />
      <Rect
        x={frame}
        y={frame}
        width={Math.max(1, object.width - frame * 2)}
        height={Math.max(1, object.height - frame * 2)}
        fill="#0d1320"
        stroke="#263547"
        strokeWidth={2 / scale}
      />
      {Array.from({ length: cellColumns + 1 }).map((_, index) => (
        <Line
          key={`v-${index}`}
          points={[
            frame + ((object.width - frame * 2) / cellColumns) * index,
            frame,
            frame + ((object.width - frame * 2) / cellColumns) * index,
            object.height - frame
          ]}
          stroke="#29384c"
          strokeWidth={2 / scale}
          listening={false}
        />
      ))}
      {Array.from({ length: cellRows + 1 }).map((_, index) => (
        <Line
          key={`h-${index}`}
          points={[
            frame,
            frame + ((object.height - frame * 2) / cellRows) * index,
            object.width - frame,
            frame + ((object.height - frame * 2) / cellRows) * index
          ]}
          stroke="#29384c"
          strokeWidth={2 / scale}
          listening={false}
        />
      ))}
      {[0.34, 0.5, 0.66].map((ratio) => (
        <Line
          key={ratio}
          points={[object.width * ratio, frame, object.width * ratio, object.height - frame]}
          stroke="#6d7f94"
          opacity={0.38}
          strokeWidth={7 / scale}
          listening={false}
        />
      ))}
      {object.warning && (
        <Text
          text="!"
          x={object.width - 150}
          y={70}
          width={90}
          height={90}
          align="center"
          verticalAlign="middle"
          fill="#b42318"
          fontSize={110}
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
}
