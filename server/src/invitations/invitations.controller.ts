import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { InvitationsService } from "./invitations.service";

@Controller("invitations")
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Get(":token")
  inspect(@Param("token") token: string) {
    return this.invitations.inspect(token);
  }

  @Post(":token/accept")
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: RequestUser, @Param("token") token: string) {
    return this.invitations.accept(token, user.id);
  }
}
