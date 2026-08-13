import { Group, Line, Text } from "react-konva";
import type { GridSettings, Viewport } from "../../types/cad";

interface Props {
  width: number;
  height: number;
  viewport: Viewport;
  grid: GridSettings;
}

export function GridLayer({ width, height, viewport, grid }: Props) {
  if (!grid.visible) return null;
  const left = -viewport.x / viewport.scale;
  const top = -viewport.y / viewport.scale;
  const right = left + width / viewport.scale;
  const bottom = top + height / viewport.scale;
  const minorStep = chooseVisibleStep(grid.minor, viewport.scale, 12);
  const majorStep = chooseVisibleStep(grid.major, viewport.scale, 56);
  const startX = Math.floor(left / minorStep) * minorStep;
  const endX = Math.ceil(right / minorStep) * minorStep;
  const startY = Math.floor(top / minorStep) * minorStep;
  const endY = Math.ceil(bottom / minorStep) * minorStep;
  const lines = [];

  for (let x = startX; x <= endX; x += minorStep) {
    const major = Math.abs(x % majorStep) < 0.001;
    lines.push(
      <Line
        key={`x-${x}`}
        points={[x, top, x, bottom]}
        stroke={x === 0 ? "#ef8b2c" : major ? "#cbd5e1" : "#e7eaef"}
        strokeWidth={(x === 0 ? 2 : major ? 1.25 : 0.75) / viewport.scale}
        listening={false}
      />
    );
  }
  for (let y = startY; y <= endY; y += minorStep) {
    const major = Math.abs(y % majorStep) < 0.001;
    lines.push(
      <Line
        key={`y-${y}`}
        points={[left, y, right, y]}
        stroke={y === 0 ? "#16855f" : major ? "#cbd5e1" : "#e7eaef"}
        strokeWidth={(y === 0 ? 2 : major ? 1.25 : 0.75) / viewport.scale}
        listening={false}
      />
    );
  }

  return (
    <Group listening={false}>
      {lines}
      <Text x={12 / viewport.scale + left} y={12 / viewport.scale + top} text="Origin axes: X / Y" fontSize={12 / viewport.scale} fill="#7a8796" />
    </Group>
  );
}

function chooseVisibleStep(baseStep: number, scale: number, minPixels: number) {
  let step = baseStep;
  while (step * scale < minPixels) {
    step *= 2;
  }
  return step;
}
