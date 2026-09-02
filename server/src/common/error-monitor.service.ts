import { Injectable } from "@nestjs/common";
import { StructuredLogger } from "./structured-logger.service";

@Injectable()
export class ErrorMonitorService {
  constructor(private readonly logger: StructuredLogger) {}

  captureException(exception: unknown, context: Record<string, unknown> = {}) {
    if (process.env.ERROR_MONITORING_PROVIDER === "none") return;
    if (process.env.NODE_ENV !== "production") return;
    this.logger.error({ provider: process.env.ERROR_MONITORING_PROVIDER || "noop", context, message: exception instanceof Error ? exception.message : "Unknown error" }, undefined, "ErrorMonitor");
  }
}
