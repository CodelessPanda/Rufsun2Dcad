import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { EmailService } from "../common/email.service";
import { createRawToken, hashToken, normalizeEmail } from "../common/tokens";
import { InvitationsService } from "../invitations/invitations.service";
import { PrismaService } from "../prisma.service";
import type { ChangePasswordDto, RequestPasswordResetDto, ResetPasswordDto, VerifyEmailDto } from "./dto/password-reset.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService
  ) {}

  async register(dto: RegisterDto, metadata: SessionMetadata = {}) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email is already registered");

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        emailVerifiedAt: process.env.NODE_ENV === "production" ? null : new Date()
      }
    });
    const verification = await this.createEmailVerification(user.id, user.email);
    if (dto.invitationToken) await this.invitations.accept(dto.invitationToken, user.id);
    return { ...(await this.createSession(user.id, user.email, metadata)), verificationUrl: isDevelopment() ? verification.url : undefined };
  }

  async login(dto: LoginDto, metadata: SessionMetadata = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    if (!user || user.status !== "active") throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    return this.createSession(user.id, user.email, metadata);
  }

  async refresh(refreshToken: string | undefined, metadata: SessionMetadata = {}) {
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
    if (session.user.status !== "active") throw new UnauthorizedException("User account is not active");
    const valid = await bcrypt.compare(refreshToken, session.tokenHash);
    if (!valid) throw new UnauthorizedException("Refresh session expired");

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(), userAgent: metadata.userAgent, ipAddress: metadata.ipAddress }
    });
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
      select: { id: true, name: true, email: true, avatarUrl: true, status: true, platformRole: true, emailVerifiedAt: true, createdAt: true }
    });
    if (!user || user.status !== "active") throw new UnauthorizedException("User account is not active");
    return user;
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    if (!user || user.status !== "active") return { ok: true };
    const token = createRawToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS)
      }
    });
    const resetUrl = this.frontendUrl(`/reset-password/${encodeURIComponent(token)}`);
    await this.email.sendPasswordReset(user.email, resetUrl);
    return { ok: true, resetUrl: isDevelopment() ? resetUrl : undefined };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const reset = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(dto.token) }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || reset.user.status !== "active") throw new BadRequestException("Password reset link is invalid or expired.");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(dto.password, 12) } }),
      this.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    return { ok: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, currentSessionId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "active") throw new UnauthorizedException("User account is not active");
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException("Invalid credentials");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null, id: currentSessionId ? { not: currentSessionId } : undefined },
        data: { revokedAt: new Date() }
      })
    ]);
    return { ok: true };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const verification = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(dto.token) }, include: { user: true } });
    if (!verification || verification.usedAt || verification.expiresAt < new Date()) throw new BadRequestException("Email verification link is invalid or expired.");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: verification.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: verification.id }, data: { usedAt: new Date() } })
    ]);
    return { ok: true };
  }

  async sessions(userId: string) {
    await this.me(userId);
    return this.prisma.refreshSession.findMany({
      where: { userId },
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, userAgent: true, ipAddress: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.me(userId);
    await this.prisma.refreshSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async revokeOtherSessions(userId: string, currentSessionId?: string) {
    await this.me(userId);
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null, id: currentSessionId ? { not: currentSessionId } : undefined },
      data: { revokedAt: new Date() }
    });
    return { ok: true };
  }

  private async createSession(userId: string, email: string, metadata: SessionMetadata = {}) {
    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: "pending",
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        lastUsedAt: new Date(),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    });
    const tokens = this.createTokens(userId, email, session.id);
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: await bcrypt.hash(tokens.refreshToken, 12) }
    });
    return tokens;
  }

  private async createEmailVerification(userId: string, email: string) {
    const token = createRawToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS)
      }
    });
    const url = this.frontendUrl(`/verify-email/${encodeURIComponent(token)}`);
    await this.email.sendEmailVerification(email, url);
    return { token, url };
  }

  private frontendUrl(path: string) {
    return `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}${path}`;
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

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}
