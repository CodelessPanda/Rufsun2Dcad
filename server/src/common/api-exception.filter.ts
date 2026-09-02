import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from "@nestjs/common";
import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { StructuredLogger } from "./structured-logger.service";
import { getRequestContext } from "./request-context";
import { ErrorMonitorService } from "./error-monitor.service";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(ErrorMonitorService) private readonly monitor: ErrorMonitorService
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; path?: string }>();
    const requestContext = getRequestContext();
    const status = statusCode(exception);
    const message = clientMessage(exception, status);
    const body = {
      statusCode: status,
      message,
      requestId: requestContext?.requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
      code: errorCode(exception, status),
      errors: validationErrors(exception)
    };

    this.logger.error({ status, method: request.method, path: request.path, code: body.code, message }, exception instanceof Error ? exception.stack : undefined, "ApiException");
    this.monitor.captureException(exception, { requestId: requestContext?.requestId, route: request.path, status });
    response.status(status).json(body);
  }
}

function validationErrors(exception: unknown) {
  if (!(exception instanceof HttpException)) return undefined;
  const response = exception.getResponse();
  if (typeof response === "object" && response && "errors" in response) {
    const errors = (response as { errors?: unknown }).errors;
    return Array.isArray(errors) ? errors : undefined;
  }
  return undefined;
}

function statusCode(exception: unknown) {
  if (exception instanceof HttpException) return exception.getStatus();
  if (exception instanceof Prisma.PrismaClientKnownRequestError) return HttpStatus.BAD_REQUEST;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function clientMessage(exception: unknown, status: number) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "object" && response && "message" in response) {
      const message = (response as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join(", ") : message || exception.message;
    }
    return exception.message;
  }
  if (status >= 500 && process.env.NODE_ENV === "production") return "Internal server error";
  return exception instanceof Error ? exception.message : "Internal server error";
}

function errorCode(exception: unknown, status: number) {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) return exception.code;
  return `HTTP_${status}`;
}
