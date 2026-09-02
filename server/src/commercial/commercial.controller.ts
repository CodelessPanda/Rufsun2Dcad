import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { CommercialService } from "./commercial.service";
import { UpdateCompanyAllocationDto, UpdateSeatCapacityDto, UpsertTenantSubscriptionDto } from "./dto/commercial.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly commercial: CommercialService) {}

  @Get("admin/commercial")
  adminOverview(@CurrentUser() user: RequestUser) {
    return this.commercial.adminOverview(user.id);
  }

  @Get("admin/commercial/plans")
  plans(@CurrentUser() user: RequestUser) {
    return this.commercial.plans(user.id);
  }

  @Patch("admin/tenants/:tenantId/subscription")
  upsertTenantSubscription(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Body() dto: UpsertTenantSubscriptionDto) {
    return this.commercial.upsertTenantSubscription(user.id, tenantId, dto);
  }

  @Patch("admin/tenants/:tenantId/seat-capacity")
  updateTenantCapacity(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Body() dto: UpdateSeatCapacityDto) {
    return this.commercial.updateTenantCapacity(user.id, tenantId, dto);
  }

  @Get("tenants/:tenantId/licensing")
  tenantLicensing(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string) {
    return this.commercial.tenantLicensing(user.id, tenantId);
  }

  @Patch("tenants/:tenantId/companies/:companyId/seat-allocation")
  updateCompanyAllocation(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Param("companyId") companyId: string, @Body() dto: UpdateCompanyAllocationDto) {
    return this.commercial.updateCompanyAllocation(user.id, tenantId, companyId, dto);
  }

  @Get("companies/:companyId/licensing")
  companyLicensing(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.commercial.companyLicensing(user.id, companyId);
  }
}
