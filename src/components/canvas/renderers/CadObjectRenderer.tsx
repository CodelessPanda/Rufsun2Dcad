import type Konva from "konva";
import type { CadObject } from "../../../types/cad";
import { CircleRenderer, DimensionRenderer, LineRenderer, MapImageRenderer, PolygonRenderer, RectangleRenderer, TextRenderer } from "./BasicRenderers";
import { SolarPanelRenderer } from "./SolarPanelRenderer";

interface Props {
  object: CadObject;
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

export function CadObjectRenderer(props: Props) {
  switch (props.object.type) {
    case "line":
      return <LineRenderer {...props} object={props.object} />;
    case "rectangle":
    case "equipment":
      return <RectangleRenderer {...props} object={props.object} />;
    case "circle":
    case "vegetation":
      return <CircleRenderer {...props} object={props.object} />;
    case "polygon":
    case "obstruction":
    case "restrictedZone":
    case "roof":
      return <PolygonRenderer {...props} object={props.object} />;
    case "text":
      return <TextRenderer {...props} object={props.object} />;
    case "dimension":
      return <DimensionRenderer {...props} object={props.object} />;
    case "solarPanel":
      return <SolarPanelRenderer {...props} object={props.object} />;
    case "mapImage":
      return <MapImageRenderer {...props} object={props.object} />;
  }
}
