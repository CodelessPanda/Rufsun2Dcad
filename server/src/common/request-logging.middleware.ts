import type { NextFunction, Request, Response } from "express";
import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { StructuredLogger } from "./structured-logger.service";
import { getRequestContext } from "./request-context";
import { routePath } from "./request-context.middleware";

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(StructuredLogger) private readonly logger: StructuredLogger) {}

  use(request: Request, response: Response, next: NextFunction) {
    const started = Date.now();
    response.on("finish", () => {
      const context = getRequestContext();
      this.logger.log({
        method: request.method,
        path: routePath(request),
        statusCode: response.statusCode,
        durationMs: Date.now() - started,
        requestId: context?.requestId
      }, "HTTP");
    });
    next();
  }
}
