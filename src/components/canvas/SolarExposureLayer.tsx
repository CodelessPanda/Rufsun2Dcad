import { Group, Image as KonvaImage, Line } from "react-konva";
import type { Point, RoofObject } from "../../types/cad";
import type { ProjectSolarDataState } from "../../cad/solar/solarExposureTypes";
import type { SolarGeoTransform } from "../../cad/solar/solarGeoTransform";

interface Props {
  solarExposure: ProjectSolarDataState;
  roofs: RoofObject[];
  debug?: boolean;
}

export function SolarExposureLayer({ solarExposure, roofs, debug = false }: Props) {
  if (solarExposure.status !== "ready") return null;

  const debugLayers = solarExposure.debugLayers;
  const debugOpacity = debugLayers?.opacity ?? 0.5;

  return (
    <Group listening={false}>
      {debugLayers?.googleSolarRgb && solarExposure.rgb?.canvas && solarExposure.transforms?.rgb && (
        <RegisteredRasterImage image={solarExposure.rgb.canvas} transform={solarExposure.transforms.rgb} opacity={debugOpacity} />
      )}
      {debugLayers?.dsm && solarExposure.dsmCanvas && solarExposure.transforms?.dsm && (
        <RegisteredRasterImage image={solarExposure.dsmCanvas} transform={solarExposure.transforms.dsm} opacity={debugOpacity} />
      )}
      {debugLayers?.buildingMask && solarExposure.maskCanvas && solarExposure.transforms?.mask && (
        <RegisteredRasterImage image={solarExposure.maskCanvas} transform={solarExposure.transforms.mask} opacity={debugOpacity} />
      )}
      {debugLayers?.annualFlux && solarExposure.heatmapCanvas && solarExposure.transforms?.annualFlux && (
        <RegisteredRasterImage image={solarExposure.heatmapCanvas} transform={solarExposure.transforms.annualFlux} opacity={debugOpacity} />
      )}
      {solarExposure.visible && solarExposure.heatmapCanvas && solarExposure.transform && roofs.length > 0 && (
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
          <RegisteredRasterImage image={solarExposure.heatmapCanvas} transform={solarExposure.transform} opacity={1} />
        </Group>
      )}
      {(debug || debugLayers?.googleSolarRgb || debugLayers?.annualFlux) && solarExposure.transform && <RasterDebugOutline transform={solarExposure.transform} />}
    </Group>
  );
}

function RegisteredRasterImage({ image, transform, opacity }: { image: HTMLCanvasElement; transform: SolarGeoTransform; opacity: number }) {
  const placement = rasterPlacement(transform.rasterWorldQuad);
  return (
    <KonvaImage
      image={image}
      x={placement.x}
      y={placement.y}
      width={placement.width}
      height={placement.height}
      rotation={placement.rotation}
      opacity={opacity}
    />
  );
}

function RasterDebugOutline({ transform }: { transform: SolarGeoTransform }) {
  const quad = transform.rasterWorldQuad;
  return (
    <Line
      points={[
        quad.topLeft.x,
        quad.topLeft.y,
        quad.topRight.x,
        quad.topRight.y,
        quad.bottomRight.x,
        quad.bottomRight.y,
        quad.bottomLeft.x,
        quad.bottomLeft.y
      ]}
      closed
      stroke="#ef4444"
      strokeWidth={4}
      dash={[120, 80]}
    />
  );
}

function rasterPlacement(quad: SolarGeoTransform["rasterWorldQuad"]) {
  const top = vector(quad.topLeft, quad.topRight);
  const left = vector(quad.topLeft, quad.bottomLeft);
  return {
    x: quad.topLeft.x,
    y: quad.topLeft.y,
    width: Math.max(1, Math.hypot(top.x, top.y)),
    height: Math.max(1, Math.hypot(left.x, left.y)),
    rotation: (Math.atan2(top.y, top.x) * 180) / Math.PI
  };
}

function vector(start: Point, end: Point) {
  return { x: end.x - start.x, y: end.y - start.y };
}
