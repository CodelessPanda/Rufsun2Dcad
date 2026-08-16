import { z } from "zod";

const pointSchema = z.object({
  x: z.number(),
  y: z.number()
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
    type: z.literal("roof"),
    name: z.string(),
    points: z.array(pointSchema).min(3),
    stroke: z.string(),
    fill: z.string(),
    tilt: z.number(),
    azimuth: z.number(),
    heightM: z.number(),
    setback: z.number().nonnegative()
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
  })
]);

export const documentSchema = z.object({
  rufsunCadVersion: z.literal("0.2"),
  version: z.string(),
  name: z.string(),
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
