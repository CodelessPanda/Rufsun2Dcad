import { Injectable, LoggerService } from "@nestjs/common";
import { getRequestContext } from "./request-context";

type LogLevel = "log" | "error" | "warn" | "debug" | "verbose";

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write("log", message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write("error", message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string) {
    if (process.env.NODE_ENV !== "production") this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string) {
    if (process.env.NODE_ENV !== "production") this.write("verbose", message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string) {
    if (process.env.NODE_ENV === "test") return;
    const request = getRequestContext();
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      context,
      requestId: request?.requestId,
      userId: request?.userId,
      tenantId: request?.tenantId,
      companyId: request?.companyId,
      route: request?.route,
      message: sanitize(message),
      trace: process.env.NODE_ENV === "production" ? undefined : sanitize(trace)
    };
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

function sanitize(value: unknown) {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/rufsun_refresh=[^;\s]+/g, "rufsun_refresh=[redacted]")
    .replace(/token=([^&\s]+)/g, "token=[redacted]")
    .replace(/key=([^&\s]+)/g, "key=[redacted]");
}
