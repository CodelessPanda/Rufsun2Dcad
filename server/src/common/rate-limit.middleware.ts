import type { NextFunction, Request, Response } from "express";
import { HttpStatus, Injectable, NestMiddleware } from "@nestjs/common";
import { getRequestContext } from "./request-context";
import { routePath } from "./request-context.middleware";

interface RateLimitRule {
  pattern: RegExp;
  methods?: string[];
  limit: number;
  windowMs: number;
}

const rules: RateLimitRule[] = [
  { pattern: /^\/api\/auth\/login$/, methods: ["POST"], limit: 8, windowMs: 60_000 },
  { pattern: /^\/api\/auth\/register$/, methods: ["POST"], limit: 5, windowMs: 60_000 },
  { pattern: /^\/api\/auth\/password\/forgot$/, methods: ["POST"], limit: 5, windowMs: 60_000 },
  { pattern: /^\/api\/invitations\//, limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/companies\/[^/]+\/projects\/[^/]+\/solar\//, limit: 30, windowMs: 60_000 },
  { pattern: /^\/api\/companies\/[^/]+\/projects\/[^/]+\/report-jobs/, limit: 10, windowMs: 60_000 }
];

const buckets = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const path = routePath(request);
    const rule = rules.find((candidate) => candidate.pattern.test(path) && (!candidate.methods || candidate.methods.includes(request.method)));
    if (!rule) return next();
    const key = `${request.ip}:${request.method}:${rule.pattern.source}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    const nextBucket = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + rule.windowMs };
    nextBucket.count += 1;
    buckets.set(key, nextBucket);
    response.setHeader("X-RateLimit-Limit", String(rule.limit));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, rule.limit - nextBucket.count)));
    response.setHeader("Retry-After", String(Math.ceil((nextBucket.resetAt - now) / 1000)));
    if (nextBucket.count > rule.limit) {
      return response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "Too many requests. Please try again shortly.",
        requestId: getRequestContext()?.requestId,
        code: "RATE_LIMITED"
      });
    }
    return next();
  }
}

export function resetRateLimitBucketsForTests() {
  buckets.clear();
}
