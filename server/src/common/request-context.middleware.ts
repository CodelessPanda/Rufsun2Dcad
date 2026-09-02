import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { runWithRequestContext } from "./request-context";

export const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = sanitizeRequestId(incoming) || randomUUID();
    response.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestContext({ requestId, route: `${request.method} ${routePath(request)}` }, next);
  }
}

export function routePath(request: Request) {
  return (request.originalUrl || request.url || request.path || "").split("?")[0];
}

function sanitizeRequestId(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(trimmed) ? trimmed : "";
}
