import { InternalServerErrorException } from "@nestjs/common";

const LOCAL_DEFAULTS = new Set(["dev-access-secret", "dev-refresh-secret", "replace-with-a-long-random-access-token-secret", "replace-with-a-long-random-refresh-token-secret"]);

export interface ServerEnvironment {
  nodeEnv: string;
  isProduction: boolean;
  frontendOrigins: string[];
  requestBodyLimit: string;
  storageDriver: "local" | "s3";
  localStoragePath: string;
  redisUrl?: string;
}

export function readServerEnvironment(): ServerEnvironment {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const frontendOrigins = parseOrigins(process.env.FRONTEND_URL || "http://localhost:5173");
  const storageDriver = (process.env.STORAGE_DRIVER || "local").toLowerCase() === "s3" ? "s3" : "local";
  return {
    nodeEnv,
    isProduction,
    frontendOrigins,
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "10mb",
    storageDriver,
    localStoragePath: process.env.LOCAL_STORAGE_PATH || "storage",
    redisUrl: process.env.REDIS_URL?.trim() || undefined
  };
}

export function validateEnvironment() {
  const env = readServerEnvironment();
  const missing = required("DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET", "FRONTEND_URL");
  if (env.isProduction) {
    if (LOCAL_DEFAULTS.has(process.env.JWT_SECRET || "")) missing.push("JWT_SECRET must be a production secret");
    if (LOCAL_DEFAULTS.has(process.env.JWT_REFRESH_SECRET || "")) missing.push("JWT_REFRESH_SECRET must be a production secret");
    if (process.env.GOOGLE_SOLAR_API_KEY === "") missing.push("GOOGLE_SOLAR_API_KEY");
    if (env.storageDriver === "s3") missing.push(...required("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"));
  }
  if (missing.length > 0) {
    throw new Error(`RufsunCAD server configuration is incomplete: ${missing.join(", ")}`);
  }
  return env;
}

export function requireProductionSecret(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new InternalServerErrorException(`${name} is not configured.`);
  return value;
}

function required(...names: string[]) {
  return names.filter((name) => !process.env[name]?.trim());
}

function parseOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
