import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { InvitationsService } from "../invitations/invitations.service";
import { CreateCompanyInvitationDto, UpdateCompanyMemberDto } from "../members/dto/member-management.dto";
import { MembersService } from "../members/members.service";
import { UpdateWorkspaceDto } from "../workspaces/dto/update-workspace.dto";
import { TenantsService } from "../tenants/tenants.service";

@Controller("companies")
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(
    @Inject(TenantsService) private readonly tenants: TenantsService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService
  ) {}

  @Get(":companyId")
  get(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.tenants.getCompany(user.id, companyId);
  }

  @Patch(":companyId")
  update(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Body() dto: UpdateWorkspaceDto) {
    return this.tenants.updateCompany(user.id, companyId, dto);
  }

  @Get(":companyId/members")
  listMembers(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.members.companyMembers(user.id, companyId);
  }

  @Patch(":companyId/members/:membershipId")
  updateMember(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("membershipId") membershipId: string, @Body() dto: UpdateCompanyMemberDto) {
    return this.members.updateCompanyMember(user.id, companyId, membershipId, dto);
  }

  @Delete(":companyId/members/:membershipId")
  removeMember(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("membershipId") membershipId: string) {
    return this.members.removeCompanyMember(user.id, companyId, membershipId);
  }

  @Post(":companyId/invitations")
  createInvitation(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Body() dto: CreateCompanyInvitationDto) {
    return this.invitations.createCompanyInvitation(user.id, companyId, dto);
  }

  @Delete(":companyId/invitations/:invitationId")
  revokeInvitation(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("invitationId") invitationId: string) {
    return this.invitations.revokeCompanyInvitation(user.id, companyId, invitationId);
  }
}
