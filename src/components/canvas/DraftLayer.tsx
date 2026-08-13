import { Circle, Group, Label, Line, Rect, Tag, Text } from "react-konva";
import type { DraftState, Point, SnapGuide, SnapMarker, Viewport } from "../../types/cad";
import { distance, formatFeetInches, formatMetric, midpoint } from "../../cad/geometry/geometry";

interface Props {
  draft: DraftState;
  guides: SnapGuide[];
  marker?: SnapMarker;
  viewport: Viewport;
}

export function DraftLayer({ draft, guides, marker, viewport }: Props) {
  const strokeWidth = 2 / viewport.scale;
  const preview = renderDraft(draft, viewport);
  return (
    <Group listening={false}>
      {guides.map((guide, index) =>
        guide.orientation === "vertical" ? (
          <Line
            key={`${guide.orientation}-${guide.value}-${index}`}
            points={[guide.value, -200000, guide.value, 200000]}
            stroke="#f28c28"
            dash={[80, 45]}
            strokeWidth={strokeWidth}
          />
        ) : (
          <Line
            key={`${guide.orientation}-${guide.value}-${index}`}
            points={[-200000, guide.value, 200000, guide.value]}
            stroke="#f28c28"
            dash={[80, 45]}
            strokeWidth={strokeWidth}
          />
        )
      )}
      {preview}
      {marker && (
        <Group x={marker.point.x} y={marker.point.y}>
          <Circle radius={70} stroke="#f28c28" strokeWidth={3 / viewport.scale} fill="white" />
          <Text text={marker.kind} x={95} y={-55} fontSize={110} fill="#9a5b14" />
        </Group>
      )}
    </Group>
  );
}

function renderDraft(draft: DraftState, viewport: Viewport) {
  if (!draft) return null;
  const stroke = "#f28c28";
  const strokeWidth = 3 / viewport.scale;
  if (draft.type === "line") {
    return <Line points={[draft.start.x, draft.start.y, draft.current.x, draft.current.y]} stroke={stroke} strokeWidth={strokeWidth} dash={[80, 50]} />;
  }
  if (draft.type === "rectangle") {
    return (
      <Rect
        x={Math.min(draft.start.x, draft.current.x)}
        y={Math.min(draft.start.y, draft.current.y)}
        width={Math.abs(draft.current.x - draft.start.x)}
        height={Math.abs(draft.current.y - draft.start.y)}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={[80, 50]}
      />
    );
  }
  if (draft.type === "circle") {
    return <Circle x={draft.center.x} y={draft.center.y} radius={distance(draft.center, draft.current)} stroke={stroke} strokeWidth={strokeWidth} dash={[80, 50]} />;
  }
  if (draft.type === "polygon") {
    const points = [...draft.points, draft.current].flatMap((point) => [point.x, point.y]);
    const start = draft.points[0];
    const closeReady = draft.roof && draft.points.length >= 3 && distance(start, draft.current) <= Math.max(120, 14 / viewport.scale);
    return (
      <Group>
        <Line points={points} stroke={stroke} strokeWidth={strokeWidth} closed={false} dash={[80, 50]} />
        {draft.roof && renderRoofDotAlignmentGuides(draft.points, draft.current, viewport)}
        {draft.roof && renderRoofSegmentLabels(draft.points, draft.current, viewport)}
        {draft.roof && (
          <>
            <Circle
              x={start.x}
              y={start.y}
              radius={closeReady ? 105 : 78}
              fill={closeReady ? "#16855f" : "#ffffff"}
              stroke={closeReady ? "#0f6b4c" : "#f28c28"}
              strokeWidth={4 / viewport.scale}
            />
            <Text
              x={start.x + 14 / viewport.scale}
              y={start.y - 8 / viewport.scale}
              text={closeReady ? "Click to close roof" : "Close dot"}
              fontSize={12 / viewport.scale}
              fill={closeReady ? "#0f6b4c" : "#9a5b14"}
            />
          </>
        )}
      </Group>
    );
  }
  if (draft.type === "dimension" || draft.type === "measure") {
    const d = distance(draft.start, draft.current);
    return (
      <Group>
        <Line points={[draft.start.x, draft.start.y, draft.current.x, draft.current.y]} stroke={stroke} strokeWidth={strokeWidth} dash={[80, 50]} />
        <Label x={(draft.start.x + draft.current.x) / 2} y={(draft.start.y + draft.current.y) / 2 - 180}>
          <Tag fill="white" stroke="#f0c07d" strokeWidth={1 / viewport.scale} />
          <Text text={formatMetric(d)} padding={22} fontSize={130} fill="#8a4b0d" />
        </Label>
      </Group>
    );
  }
  return null;
}

function renderRoofSegmentLabels(points: Point[], current: Point, viewport: Viewport) {
  const segments = [...points.slice(1), current].map((point, index) => ({
    start: points[index],
    end: point
  }));
  return segments
    .filter((segment) => distance(segment.start, segment.end) > 1)
    .map((segment, index) => {
      const center = midpoint(segment.start, segment.end);
      const labelPosition = offsetSegmentLabel(segment.start, segment.end, center, 16 / viewport.scale);
      return (
        <Label key={`roof-draft-measure-${index}`} x={labelPosition.x} y={labelPosition.y}>
          <Tag fill="rgba(255,255,255,0.94)" stroke="#f0c07d" strokeWidth={1 / viewport.scale} cornerRadius={4 / viewport.scale} />
          <Text
            text={formatFeetInches(distance(segment.start, segment.end))}
            padding={4 / viewport.scale}
            fontSize={13 / viewport.scale}
            fill="#8a4b0d"
            fontStyle="600"
          />
        </Label>
      );
    });
}

function renderRoofDotAlignmentGuides(points: Point[], current: Point, viewport: Viewport) {
  const tolerance = Math.max(2, 2 / viewport.scale);
  return points
    .filter((point) => distance(point, current) > tolerance)
    .flatMap((point, index) => {
      const guides = [];
      if (Math.abs(point.x - current.x) <= tolerance) {
        guides.push(
          <Line
            key={`roof-dot-x-${index}`}
            points={[point.x, point.y, current.x, current.y]}
            stroke="#16855f"
            strokeWidth={2 / viewport.scale}
            dash={[50, 35]}
          />
        );
      }
      if (Math.abs(point.y - current.y) <= tolerance) {
        guides.push(
          <Line
            key={`roof-dot-y-${index}`}
            points={[point.x, point.y, current.x, current.y]}
            stroke="#16855f"
            strokeWidth={2 / viewport.scale}
            dash={[50, 35]}
          />
        );
      }
      return guides;
    });
}

function offsetSegmentLabel(start: Point, end: Point, center: Point, offset: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    x: center.x + (-dy / length) * offset,
    y: center.y + (dx / length) * offset
  };
}
