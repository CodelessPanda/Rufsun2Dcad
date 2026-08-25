import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { AuthenticatedRequest, RequestUser } from "../common/request-user";

const COOKIE_NAME = "rufsun_refresh";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.register(dto);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(dto);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  @Post("refresh")
  async refresh(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.refresh(request.cookies?.[COOKIE_NAME]);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  @Post("logout")
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[COOKIE_NAME]);
    response.clearCookie(COOKIE_NAME);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
  }
}
