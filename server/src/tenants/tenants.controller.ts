import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { InvitationsService } from "../invitations/invitations.service";
import { CreateTenantInvitationDto, UpdateTenantMemberDto } from "../members/dto/member-management.dto";
import { MembersService } from "../members/members.service";
import { CreateWorkspaceDto } from "../workspaces/dto/create-workspace.dto";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly tenants: TenantsService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.tenants.listForUser(user.id);
  }

  @Get(":tenantId/companies")
  companies(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string) {
    return this.tenants.listCompanies(user.id, tenantId);
  }

  @Post(":tenantId/companies")
  createCompany(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Body() dto: CreateWorkspaceDto) {
    return this.tenants.createCompany(user.id, tenantId, dto);
  }

  @Get(":tenantId/members")
  membersList(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string) {
    return this.members.tenantMembers(user.id, tenantId);
  }

  @Patch(":tenantId/members/:membershipId")
  updateMember(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Param("membershipId") membershipId: string, @Body() dto: UpdateTenantMemberDto) {
    return this.members.updateTenantMember(user.id, tenantId, membershipId, dto);
  }

  @Delete(":tenantId/members/:membershipId")
  removeMember(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Param("membershipId") membershipId: string) {
    return this.members.removeTenantMember(user.id, tenantId, membershipId);
  }

  @Post(":tenantId/invitations")
  createInvitation(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Body() dto: CreateTenantInvitationDto) {
    return this.invitations.createTenantInvitation(user.id, tenantId, dto);
  }

  @Delete(":tenantId/invitations/:invitationId")
  revokeInvitation(@CurrentUser() user: RequestUser, @Param("tenantId") tenantId: string, @Param("invitationId") invitationId: string) {
    return this.invitations.revokeTenantInvitation(user.id, tenantId, invitationId);
  }
}
