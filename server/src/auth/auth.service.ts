import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaService } from "../prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email is already registered");

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12)
      }
    });
    return this.createSession(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || user.status !== "active") throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    return this.createSession(user.id, user.email);
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException("Missing refresh token");
    let payload: { sub: string; sid: string; email: string };
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "dev-refresh-secret") as typeof payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const session = await this.prisma.refreshSession.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh session expired");
    }
    const valid = await bcrypt.compare(refreshToken, session.tokenHash);
    if (!valid) throw new UnauthorizedException("Refresh session expired");

    return this.createTokens(session.user.id, session.user.email, session.id);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "dev-refresh-secret") as { sid: string };
      await this.prisma.refreshSession.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    } catch {
      return;
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true, status: true, emailVerifiedAt: true, createdAt: true }
    });
    if (!user) throw new UnauthorizedException("User not found");
    return user;
  }

  private async createSession(userId: string, email: string) {
    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: "pending",
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000)
      }
    });
    const tokens = this.createTokens(userId, email, session.id);
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: await bcrypt.hash(tokens.refreshToken, 12) }
    });
    return tokens;
  }

  private createTokens(userId: string, email: string, sessionId: string) {
    const accessToken = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET || "dev-access-secret", {
      expiresIn: ACCESS_TTL_SECONDS
    });
    const refreshToken = jwt.sign({ sub: userId, email, sid: sessionId }, process.env.JWT_REFRESH_SECRET || "dev-refresh-secret", {
      expiresIn: REFRESH_TTL_SECONDS
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }
}
