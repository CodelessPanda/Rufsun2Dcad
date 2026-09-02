import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: RequestUser) {
    return this.admin.dashboard(user.id);
  }

  @Get("companies")
  companies(@CurrentUser() user: RequestUser) {
    return this.admin.companies(user.id);
  }

  @Get("companies/:companyId")
  company(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.admin.company(user.id, companyId);
  }

  @Post("support-mode/companies/:companyId")
  enterSupportMode(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.admin.enterSupportMode(user.id, companyId);
  }

  @Post("support-mode/exit")
  exitSupportMode(@CurrentUser() user: RequestUser) {
    return this.admin.exitSupportMode(user.id);
  }
}
