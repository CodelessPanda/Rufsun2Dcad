import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantRole, WorkspaceMemberRole, WorkspaceMemberStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { CommercialService } from "../commercial/commercial.service";
import type { UpdateCompanyMemberDto, UpdateTenantMemberDto } from "./dto/member-management.dto";

@Injectable()
export class MembersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async companyMembers(userId: string, companyId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_VIEW);
    const [members, invitations] = await Promise.all([
      this.prisma.companyMembership.findMany({
        where: { companyId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.invitation.findMany({
        where: { companyId, scope: "company", acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" }
      })
    ]);
    return { members, invitations: invitations.map(redactInvitation) };
  }

  async updateCompanyMember(userId: string, companyId: string, membershipId: string, dto: UpdateCompanyMemberDto) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_UPDATE);
    if (dto.role) await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_ROLES_MANAGE);
    const membership = await this.prisma.companyMembership.findFirst({ where: { id: membershipId, companyId }, include: { user: true } });
    if (!membership) throw new NotFoundException("Company member not found");
    if (membership.userId === userId && dto.role && dto.role !== membership.role) await this.ensureNotFinalCompanyOwner(companyId, membership.role, dto.role);
    if (dto.status && dto.status !== "active") await this.ensureNotFinalCompanyOwner(companyId, membership.role, "project_viewer", membership.id);
    const nextStatus = normalizeMembershipStatus(dto.status) ?? membership.status;
    const nextSeat = dto.seatType ?? membership.seatType;
    if (nextStatus === "active" && (dto.seatType || dto.status === "active")) {
      await this.commercial.requireSeatAssignable(companyId, nextSeat, membership.id);
    }
    return this.prisma.companyMembership.update({
      where: { id: membershipId },
      data: {
        role: dto.role,
        seatType: dto.seatType,
        status: normalizeMembershipStatus(dto.status)
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } }
    });
  }

  async removeCompanyMember(userId: string, companyId: string, membershipId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_REMOVE);
    const membership = await this.prisma.companyMembership.findFirst({ where: { id: membershipId, companyId } });
    if (!membership) throw new NotFoundException("Company member not found");
    await this.ensureNotFinalCompanyOwner(companyId, membership.role, "project_viewer", membership.id);
    return this.prisma.companyMembership.update({ where: { id: membershipId }, data: { status: "removed" } });
  }

  async tenantMembers(userId: string, tenantId: string) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_MEMBERS_VIEW);
    const [members, invitations] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where: { tenantId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.invitation.findMany({
        where: { tenantId, scope: "tenant", acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" }
      })
    ]);
    return { members, invitations: invitations.map(redactInvitation) };
  }

  async updateTenantMember(userId: string, tenantId: string, membershipId: string, dto: UpdateTenantMemberDto) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_MEMBERS_UPDATE);
    const membership = await this.prisma.tenantMembership.findFirst({ where: { id: membershipId, tenantId }, include: { user: true } });
    if (!membership) throw new NotFoundException("Tenant member not found");
    if (membership.userId === userId && dto.role && dto.role !== membership.role) await this.ensureNotFinalTenantOwner(tenantId, membership.role, dto.role);
    if (dto.status && dto.status !== "active") await this.ensureNotFinalTenantOwner(tenantId, membership.role, "member", membership.id);
    return this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: {
        role: dto.role,
        status: normalizeMembershipStatus(dto.status)
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } }
    });
  }

  async removeTenantMember(userId: string, tenantId: string, membershipId: string) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_MEMBERS_REMOVE);
    const membership = await this.prisma.tenantMembership.findFirst({ where: { id: membershipId, tenantId } });
    if (!membership) throw new NotFoundException("Tenant member not found");
    await this.ensureNotFinalTenantOwner(tenantId, membership.role, "member", membership.id);
    return this.prisma.tenantMembership.update({ where: { id: membershipId }, data: { status: "removed" } });
  }

  private async ensureNotFinalCompanyOwner(companyId: string, currentRole: WorkspaceMemberRole, nextRole: WorkspaceMemberRole, excludingMembershipId?: string) {
    if (!isCompanyOwnerRole(currentRole) || isCompanyOwnerRole(nextRole)) return;
    const owners = await this.prisma.companyMembership.findMany({ where: { companyId, role: "company_owner", status: "active" } });
    const remainingOwners = owners.filter((owner) => owner.id !== excludingMembershipId);
    if (remainingOwners.length === 0) throw new BadRequestException("Cannot remove or demote the final Company Owner.");
  }

  private async ensureNotFinalTenantOwner(tenantId: string, currentRole: TenantRole, nextRole: TenantRole, excludingMembershipId?: string) {
    if (currentRole !== "owner" || nextRole === "owner") return;
    const owners = await this.prisma.tenantMembership.findMany({ where: { tenantId, role: "owner", status: "active" } });
    const remainingOwners = owners.filter((owner) => owner.id !== excludingMembershipId);
    if (remainingOwners.length === 0) throw new BadRequestException("Cannot remove or demote the final Tenant Owner.");
  }
}

export function redactInvitation(invitation: { tokenHash?: string; [key: string]: unknown }) {
  const { tokenHash: _tokenHash, ...safeInvitation } = invitation;
  return safeInvitation;
}

function isCompanyOwnerRole(role: WorkspaceMemberRole) {
  return role === "company_owner" || role === "owner";
}

function normalizeMembershipStatus(status?: WorkspaceMemberStatus) {
  return status === "disabled" ? "suspended" : status;
}
