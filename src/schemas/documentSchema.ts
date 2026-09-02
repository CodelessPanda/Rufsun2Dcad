import { z } from "zod";

const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const solarRegistrationSchema = z.object({
  eastOffsetMeters: z.number(),
  northOffsetMeters: z.number(),
  rotationDegrees: z.number(),
  scale: z.number().positive(),
  calibrated: z.boolean()
});

const roofEdgeMetadataSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  classification: z.enum(["EAVE", "RIDGE", "HIP", "VALLEY", "RAKE", "UNKNOWN"]),
  setback: z.number().nonnegative().optional()
});

const siteSchema = z.object({
  northRotation: z.number(),
  structures: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      roofFaceIds: z.array(z.string()),
      buildingType: z.enum(["house", "garage", "shed", "commercial", "other"]).optional(),
      notes: z.string().optional()
    })
  ),
  imagery: z.object({
    provider: z.enum(["google", "airbus", "skyfi", "vexcel", "other"]),
    sourceId: z.string().optional(),
    captureDate: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    zoom: z.number(),
    imageWidthPx: z.number().positive(),
    imageHeightPx: z.number().positive(),
    widthM: z.number().positive(),
    heightM: z.number().positive(),
    metersPerPixelX: z.number().positive(),
    metersPerPixelY: z.number().positive()
  }).optional(),
  scaleCalibration: z.object({
    knownDistanceM: z.number().positive(),
    measuredDistanceMm: z.number().positive(),
    calibratedAt: z.string()
  }).optional()
});

const baseSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  layerId: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  zIndex: z.number()
});

const objectSchema = z.discriminatedUnion("type", [
  baseSchema.extend({ type: z.literal("line"), x2: z.number(), y2: z.number(), stroke: z.string() }),
  baseSchema.extend({
    type: z.literal("rectangle"),
    width: z.number().positive(),
    height: z.number().positive(),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("circle"),
    radius: z.number().positive(),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("polygon"),
    points: z.array(pointSchema).min(3),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("obstruction"),
    name: z.string(),
    obstructionType: z.enum(["skylight", "chimney", "hvac", "roofHatch", "vent", "tank", "other"]).optional(),
    points: z.array(pointSchema).min(3),
    clearance: z.number().nonnegative(),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("restrictedZone"),
    name: z.string(),
    points: z.array(pointSchema).min(3),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("equipment"),
    name: z.string(),
    equipmentType: z.enum(["inverter", "disconnect", "mainPanel", "battery", "utilityMeter", "other"]).optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("vegetation"),
    label: z.string(),
    radius: z.number().positive(),
    heightM: z.number().positive().optional(),
    stroke: z.string(),
    fill: z.string()
  }),
  baseSchema.extend({
    type: z.literal("roof"),
    name: z.string(),
    structureId: z.string().optional(),
    points: z.array(pointSchema).min(3),
    stroke: z.string(),
    fill: z.string(),
    tilt: z.number(),
    pitch: z.number().optional(),
    azimuth: z.number(),
    heightM: z.number(),
    elevationM: z.number().optional(),
    roofType: z.enum(["flat", "pitched", "shed", "gable", "hip", "other"]).optional(),
    material: z.enum(["metal", "tile", "shingle", "concrete", "other"]).optional(),
    setback: z.number().nonnegative(),
    edgeMetadata: z.array(roofEdgeMetadataSchema).optional()
  }),
  baseSchema.extend({
    type: z.literal("text"),
    text: z.string(),
    fontSize: z.number().positive(),
    color: z.string()
  }),
  baseSchema.extend({
    type: z.literal("dimension"),
    start: pointSchema,
    end: pointSchema,
    mode: z.enum(["horizontal", "vertical", "aligned"])
  }),
  baseSchema.extend({
    type: z.literal("solarPanel"),
    manufacturer: z.string(),
    model: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    thickness: z.number().positive(),
    wattage: z.number().positive(),
    orientation: z.enum(["portrait", "landscape"]),
    moduleGap: z.number().nonnegative(),
    warning: z.string().optional()
  }),
  baseSchema.extend({
    type: z.literal("mapImage"),
    width: z.number().positive(),
    height: z.number().positive(),
    opacity: z.number().min(0).max(1),
    capture: z.object({
      latitude: z.number(),
      longitude: z.number(),
      zoom: z.number(),
      widthM: z.number().positive(),
      heightM: z.number().positive(),
      imageWidthPx: z.number().positive(),
      imageHeightPx: z.number().positive(),
      mapType: z.enum(["satellite", "roadmap", "hybrid"])
    })
  })
]);

export const documentSchema = z.object({
  rufsunCadVersion: z.literal("0.2"),
  version: z.string(),
  name: z.string(),
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  mapCapture: z.object({
    latitude: z.number(),
    longitude: z.number(),
    zoom: z.number(),
    widthM: z.number().positive(),
    heightM: z.number().positive(),
    imageWidthPx: z.number().positive(),
    imageHeightPx: z.number().positive(),
    mapType: z.enum(["satellite", "roadmap", "hybrid"])
  }).optional(),
  solarRegistration: solarRegistrationSchema.optional(),
  site: siteSchema.optional(),
  units: z.literal("mm"),
  objects: z.array(objectSchema),
  layers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      visible: z.boolean(),
      locked: z.boolean()
    })
  ),
  settings: z.object({
    activeLayerId: z.string(),
    grid: z.object({
      visible: z.boolean(),
      minor: z.number().positive(),
      major: z.number().positive()
    }),
    snap: z.object({
      enabled: z.boolean(),
      grid: z.boolean(),
      endpoints: z.boolean(),
      midpoints: z.boolean(),
      centers: z.boolean(),
      edges: z.boolean(),
      alignment: z.boolean(),
      tolerancePx: z.number().positive()
    })
  }),
  createdAt: z.string(),
  updatedAt: z.string()
});
