import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantsService } from "./tenants.service";

@Controller("admin/tenants")
@UseGuards(JwtAuthGuard)
export class AdminTenantsController {
  constructor(@Inject(TenantsService) private readonly tenants: TenantsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.tenants.adminList(user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTenantDto) {
    return this.tenants.adminCreate(user.id, dto);
  }

  @Get(":tenantId")
  get(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string) {
    return this.tenants.adminGet(user.id, tenantId);
  }

  @Patch(":tenantId")
  update(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.adminUpdate(user.id, tenantId, dto);
  }
}
