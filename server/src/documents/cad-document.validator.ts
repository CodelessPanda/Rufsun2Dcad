import { BadRequestException } from "@nestjs/common";

const SUPPORTED_SCHEMA_VERSIONS = new Set(["1", "1.0", "1.0.0"]);
const SUPPORTED_CAD_VERSIONS = new Set(["0.1", "0.2"]);

export function validateCadDocument(documentJson: unknown, schemaVersion = "1") {
  const errors: string[] = [];
  if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) errors.push(`Unsupported CAD document schema version: ${schemaVersion}`);
  if (!isRecord(documentJson)) errors.push("documentJson must be an object.");
  if (errors.length > 0) throw cadValidationError(errors);
  const document = documentJson as Record<string, unknown>;

  if (typeof document.name !== "string" || !document.name.trim()) errors.push("Document name is required.");
  if (document.rufsunCadVersion !== undefined && (!isString(document.rufsunCadVersion) || !SUPPORTED_CAD_VERSIONS.has(document.rufsunCadVersion))) {
    errors.push("Unsupported RufsunCAD document version.");
  }
  if (document.units !== undefined && document.units !== "mm") errors.push("Only millimeter CAD documents are supported.");
  if (!Array.isArray(document.objects)) errors.push("Document objects must be an array.");
  if (document.layers !== undefined && !Array.isArray(document.layers)) errors.push("Document layers must be an array.");
  if (document.settings !== undefined && !isRecord(document.settings)) errors.push("Document settings must be an object.");
  if (document.site !== undefined) validateSite(document.site, errors);
  if (document.subarrays !== undefined) {
    if (!Array.isArray(document.subarrays)) errors.push("Document subarrays must be an array.");
    else {
      document.subarrays.forEach((subarray, index) => {
        if (!isRecord(subarray) || !isString(subarray.id) || !isString(subarray.name)) {
          errors.push(`Subarray ${index + 1} must include id and name.`);
        }
      });
    }
  }

  if (Array.isArray(document.objects)) {
    document.objects.slice(0, 3000).forEach((object, index) => validateObject(object, index, errors));
    if (document.objects.length > 3000) errors.push("Document contains too many objects.");
  }
  if (Array.isArray(document.layers)) {
    document.layers.forEach((layer, index) => {
      if (!isRecord(layer)) errors.push(`Layer ${index + 1} must be an object.`);
      else if (!isString(layer.id) || !isString(layer.name)) errors.push(`Layer ${index + 1} must include id and name.`);
    });
  }

  if (errors.length > 0) throw cadValidationError(errors);
  return document as Record<string, unknown>;
}

function validateObject(object: unknown, index: number, errors: string[]) {
  const label = `Object ${index + 1}`;
  if (!isRecord(object)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (!isString(object.id)) errors.push(`${label} must include an id.`);
  if (!isString(object.type)) {
    errors.push(`${label} must include a type.`);
    return;
  }

  switch (object.type) {
    case "roof":
    case "polygon":
    case "obstruction":
    case "restrictedZone":
      if (!Array.isArray(object.points) || object.points.length < 3) errors.push(`${label} must include at least three points.`);
      else object.points.forEach((point, pointIndex) => validatePoint(point, `${label} point ${pointIndex + 1}`, errors));
      if (object.type === "obstruction") validateNonnegativeIfPresent(object.clearance, `${label} clearance`, errors);
      break;
    case "equipment":
      validatePositiveIfPresent(object.width, `${label} width`, errors);
      validatePositiveIfPresent(object.height, `${label} height`, errors);
      break;
    case "vegetation":
      validatePositiveIfPresent(object.radius, `${label} radius`, errors);
      validatePositiveIfPresent(object.heightM, `${label} height`, errors);
      break;
    case "solarPanel":
      validatePositiveIfPresent(object.width, `${label} width`, errors);
      validatePositiveIfPresent(object.height, `${label} height`, errors);
      validatePositiveIfPresent(object.wattage, `${label} wattage`, errors);
      break;
    case "mapImage":
      validatePositiveIfPresent(object.width, `${label} width`, errors);
      validatePositiveIfPresent(object.height, `${label} height`, errors);
      if (!isRecord(object.capture)) errors.push(`${label} must include map capture metadata.`);
      break;
    case "line":
    case "rectangle":
    case "circle":
    case "text":
    case "dimension":
      break;
    default:
      errors.push(`${label} has unsupported type '${object.type}'.`);
  }
}

function validatePoint(point: unknown, label: string, errors: string[]) {
  if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) errors.push(`${label} must include numeric x and y.`);
}

function validateSite(site: unknown, errors: string[]) {
  if (!isRecord(site)) {
    errors.push("Site metadata must be an object.");
    return;
  }
  if (site.northRotation !== undefined && !isFiniteNumber(site.northRotation)) errors.push("Site north rotation must be numeric.");
  if (site.structures !== undefined) {
    if (!Array.isArray(site.structures)) errors.push("Site structures must be an array.");
    else {
      site.structures.forEach((structure, index) => {
        if (!isRecord(structure) || !isString(structure.id) || !isString(structure.name) || !Array.isArray(structure.roofFaceIds)) {
          errors.push(`Site structure ${index + 1} must include id, name, and roofFaceIds.`);
        }
      });
    }
  }
  if (site.imagery !== undefined && !isRecord(site.imagery)) errors.push("Site imagery metadata must be an object.");
}

function validatePositiveIfPresent(value: unknown, label: string, errors: string[]) {
  if (value !== undefined && (!isFiniteNumber(value) || value <= 0)) errors.push(`${label} must be a positive number.`);
}

function validateNonnegativeIfPresent(value: unknown, label: string, errors: string[]) {
  if (value !== undefined && (!isFiniteNumber(value) || value < 0)) errors.push(`${label} must be a nonnegative number.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cadValidationError(errors: string[]) {
  return new BadRequestException({
    message: "CAD document validation failed.",
    errors
  });
}
