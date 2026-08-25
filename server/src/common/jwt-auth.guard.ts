import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import type { AuthenticatedRequest, RequestUser } from "./request-user";

interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { headers: Record<string, string | undefined> }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) throw new UnauthorizedException("Missing access token");

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-access-secret") as AccessTokenPayload;
      request.user = { id: payload.sub, email: payload.email } satisfies RequestUser;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
