import { Group, Image as KonvaImage, Line } from "react-konva";
import type { RoofObject } from "../../types/cad";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";

interface Props {
  solarExposure: ProjectSolarDataState;
  roofs: RoofObject[];
  debug?: boolean;
}

export function SolarExposureLayer({ solarExposure, roofs, debug = false }: Props) {
  if (
    solarExposure.status !== "ready" ||
    !solarExposure.visible ||
    !solarExposure.heatmapCanvas ||
    !solarExposure.transform ||
    roofs.length === 0
  ) {
    return null;
  }

  const rect = solarExposure.transform.rasterWorldRect;
  return (
    <Group listening={false}>
      <Group
        clipFunc={(ctx) => {
          roofs.forEach((roof) => {
            roof.points.forEach((point, index) => {
              if (index === 0) ctx.moveTo(point.x, point.y);
              else ctx.lineTo(point.x, point.y);
            });
            ctx.closePath();
          });
        }}
      >
        <KonvaImage
          image={solarExposure.heatmapCanvas}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          opacity={1}
        />
      </Group>
      {debug && (
        <Line
          points={[rect.x, rect.y, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height]}
          closed
          stroke="#ef4444"
          strokeWidth={4}
          dash={[120, 80]}
        />
      )}
    </Group>
  );
}
