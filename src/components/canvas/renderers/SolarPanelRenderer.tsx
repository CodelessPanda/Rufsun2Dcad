import { Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { SolarPanelObject } from "../../../types/cad";

interface Props {
  object: SolarPanelObject;
  selected: boolean;
  draggable: boolean;
  listening: boolean;
  scale: number;
  /** 1-based stable position index shown as a badge on the panel. */
  panelNumber?: number;
  /** Cyan highlight ring — set when the user hovers a row in the energy table. */
  highlighted?: boolean;
  registerNode: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (id: string, node: Konva.Node) => void;
  onDragMove: (id: string, node: Konva.Node) => void;
  onDragEnd: (id: string, node: Konva.Node) => void;
  onTransformEnd: (id: string, node: Konva.Node) => void;
}

export function SolarPanelRenderer({
  object, selected, draggable, listening, scale,
  panelNumber, highlighted,
  registerNode, onSelect, onDragStart, onDragMove, onDragEnd, onTransformEnd
}: Props) {
  const cellColumns = object.orientation === "portrait" ? 6 : 12;
  const cellRows    = object.orientation === "portrait" ? 12 : 6;
  const frame = Math.max(28, object.thickness);
  const showCellDetail = Math.min(object.width, object.height) * scale > 48;

  // Badge: white square, scaled so it stays proportional to the panel
  const badgeSize     = Math.min(object.width, object.height) * 0.58;
  const badgeFontSize = badgeSize * 0.68;
  const showBadge     = panelNumber !== undefined && badgeSize > 0;

  const strokeColor  = highlighted ? "#22d3ee" : selected ? "#f28c28" : "#c9d0d8";
  const strokeWidth  = highlighted ? 6          : selected ? 4         : 2;
  const shadowColor  = highlighted ? "#22d3ee" : selected ? "#f28c28" : "black";
  const shadowOpacity = highlighted ? 0.55      : selected ? 0.28      : 0.08;
  const shadowBlur   = highlighted ? 18         : selected ? 10        : 3;

  return (
    <Group
      id={`node-${object.id}`}
      ref={(node) => registerNode(object.id, node)}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={draggable}
      listening={listening}
      dragDistance={4}
      onClick={(e) => { e.cancelBubble = true; onSelect(object.id, e.evt.shiftKey); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(object.id, false); }}
      onContextMenu={(e) => { e.cancelBubble = true; }}
      onDragStart={(e) => onDragStart(object.id, e.target)}
      onDragMove={(e)  => onDragMove(object.id, e.target)}
      onDragEnd={(e)   => onDragEnd(object.id, e.target)}
      onTransformEnd={(e) => onTransformEnd(object.id, e.target)}
    >
      {/* Panel body */}
      <Rect
        width={object.width} height={object.height}
        fill="#141a21"
        stroke={strokeColor} strokeWidth={strokeWidth} strokeScaleEnabled={false}
        cornerRadius={18}
        shadowColor={shadowColor} shadowOpacity={shadowOpacity} shadowBlur={shadowBlur}
        shadowForStrokeEnabled={false} perfectDrawEnabled={false}
      />
      {/* Inner cell area */}
      <Rect
        x={frame} y={frame}
        width={Math.max(1, object.width - frame * 2)}
        height={Math.max(1, object.height - frame * 2)}
        fill="#0d1320" stroke="#263547" strokeWidth={1}
        strokeScaleEnabled={false} perfectDrawEnabled={false}
      />
      {/* Cell grid lines */}
      {showCellDetail && Array.from({ length: cellColumns + 1 }).map((_, i) => (
        <Line key={`v-${i}`}
          points={[frame + ((object.width - frame*2)/cellColumns)*i, frame,
                   frame + ((object.width - frame*2)/cellColumns)*i, object.height - frame]}
          stroke="#29384c" strokeWidth={1} strokeScaleEnabled={false}
          listening={false} perfectDrawEnabled={false} />
      ))}
      {showCellDetail && Array.from({ length: cellRows + 1 }).map((_, i) => (
        <Line key={`h-${i}`}
          points={[frame, frame + ((object.height - frame*2)/cellRows)*i,
                   object.width - frame, frame + ((object.height - frame*2)/cellRows)*i]}
          stroke="#29384c" strokeWidth={1} strokeScaleEnabled={false}
          listening={false} perfectDrawEnabled={false} />
      ))}
      {showCellDetail && [0.34, 0.5, 0.66].map((ratio) => (
        <Line key={ratio}
          points={[object.width*ratio, frame, object.width*ratio, object.height - frame]}
          stroke="#6d7f94" opacity={0.38} strokeWidth={2} strokeScaleEnabled={false}
          listening={false} perfectDrawEnabled={false} />
      ))}
      {/* Warning icon */}
      {object.warning && (
        <Text text="!" x={object.width - 150} y={70} width={90} height={90}
          align="center" verticalAlign="middle"
          fill="#b42318" fontSize={110} fontStyle="bold" listening={false} />
      )}
      {/* ── Panel number badge ── */}
      {showBadge && (
        <Group x={frame / 2} y={frame / 2} rotation={-object.rotation} listening={false}>
          <Rect
            width={badgeSize} height={badgeSize}
            fill={highlighted ? "#22d3ee" : "#ffffff"}
            opacity={0.92} cornerRadius={badgeSize * 0.22}
            perfectDrawEnabled={false}
          />
          <Text
            text={String(panelNumber)}
            width={badgeSize} height={badgeSize}
            align="center" verticalAlign="middle"
            fill={highlighted ? "#0e7490" : "#141a21"}
            fontSize={badgeFontSize} fontStyle="bold"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}
