import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Invitation, SeatType, TenantRole, WorkspaceMemberRole } from "@prisma/client";
import { AccessControlService } from "../common/access-control.service";
import { EmailService } from "../common/email.service";
import { Permissions } from "../common/permissions";
import { createRawToken, hashToken, normalizeEmail } from "../common/tokens";
import { CommercialService } from "../commercial/commercial.service";
import { PrismaService } from "../prisma.service";
import type { CreateCompanyInvitationDto, CreateTenantInvitationDto } from "../members/dto/member-management.dto";
import { redactInvitation } from "../members/members.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async createCompanyInvitation(userId: string, companyId: string, dto: CreateCompanyInvitationDto) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_INVITE);
    if (normalizeCompanyRole(dto.role) === "company_owner") {
      await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_ROLES_MANAGE);
    }
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    const email = normalizeEmail(dto.email);
    const token = createRawToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        scope: "company",
        tenantId: company.tenantId,
        companyId,
        companyRole: normalizeCompanyRole(dto.role),
        seatType: dto.seatType ?? defaultSeatForRole(dto.role),
        tokenHash: hashToken(token),
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS)
      }
    });
    const invitationUrl = this.invitationUrl(token);
    await this.email.sendInvitation(email, invitationUrl);
    return { ...redactInvitation(invitation), invitationUrl };
  }

  async createTenantInvitation(userId: string, tenantId: string, dto: CreateTenantInvitationDto) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_MEMBERS_INVITE);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    const email = normalizeEmail(dto.email);
    const token = createRawToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        email,
        scope: "tenant",
        tenantId,
        tenantRole: dto.role,
        tokenHash: hashToken(token),
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS)
      }
    });
    const invitationUrl = this.invitationUrl(token);
    await this.email.sendInvitation(email, invitationUrl);
    return { ...redactInvitation(invitation), invitationUrl };
  }

  async inspect(token: string) {
    const invitation = await this.findUsableInvitation(token, false);
    return redactInvitation(invitation);
  }

  async accept(token: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "active") throw new ForbiddenException("User account is not active");
    const invitation = await this.findUsableInvitation(token, true);
    if (normalizeEmail(user.email) !== invitation.email) throw new ForbiddenException("This invitation belongs to another email address.");

    if (invitation.scope === "company") {
      if (!invitation.companyId || !invitation.companyRole || !invitation.seatType) throw new BadRequestException("Invitation is incomplete.");
      const existingMembership = await this.prisma.companyMembership.findFirst({ where: { companyId: invitation.companyId, userId } });
      await this.commercial.requireSeatAssignable(invitation.companyId, invitation.seatType, existingMembership?.id);
      await this.prisma.companyMembership.upsert({
        where: { companyId_userId: { companyId: invitation.companyId, userId } },
        update: {
          role: invitation.companyRole,
          seatType: invitation.seatType,
          status: "active",
          joinedAt: new Date()
        },
        create: {
          companyId: invitation.companyId,
          userId,
          role: invitation.companyRole,
          seatType: invitation.seatType,
          status: "active",
          joinedAt: new Date()
        }
      });
      if (invitation.tenantId) {
        await this.prisma.tenantMembership.upsert({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
          update: {},
          create: { tenantId: invitation.tenantId, userId, role: "member", status: "active", joinedAt: new Date() }
        });
      }
    } else {
      if (!invitation.tenantId || !invitation.tenantRole) throw new BadRequestException("Invitation is incomplete.");
      await this.prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
        update: { role: invitation.tenantRole, status: "active", joinedAt: new Date() },
        create: { tenantId: invitation.tenantId, userId, role: invitation.tenantRole, status: "active", joinedAt: new Date() }
      });
    }

    const accepted = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedByUserId: userId }
    });
    return redactInvitation(accepted);
  }

  async revokeCompanyInvitation(userId: string, companyId: string, invitationId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_REMOVE);
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, companyId, scope: "company" } });
    if (!invitation) throw new NotFoundException("Invitation not found");
    return redactInvitation(await this.prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } }));
  }

  async revokeTenantInvitation(userId: string, tenantId: string, invitationId: string) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_MEMBERS_REMOVE);
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, tenantId, scope: "tenant" } });
    if (!invitation) throw new NotFoundException("Invitation not found");
    return redactInvitation(await this.prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } }));
  }

  private async findUsableInvitation(token: string, requireUnused: boolean) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { tenant: true, company: true }
    });
    if (!invitation) throw new NotFoundException("Invitation not found");
    if (invitation.revokedAt) throw new BadRequestException("Invitation has been revoked.");
    if (invitation.expiresAt < new Date()) throw new BadRequestException("Invitation has expired.");
    if (requireUnused && invitation.acceptedAt) throw new BadRequestException("Invitation has already been accepted.");
    return invitation;
  }

  private invitationUrl(token: string) {
    const base = process.env.FRONTEND_URL || "http://localhost:5173";
    return `${base.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
  }
}

function normalizeCompanyRole(role: WorkspaceMemberRole) {
  const legacy: Partial<Record<WorkspaceMemberRole, WorkspaceMemberRole>> = {
    owner: "company_owner",
    admin: "company_admin",
    sales: "sales_rep",
    viewer: "project_viewer"
  };
  return legacy[role] ?? role;
}

function defaultSeatForRole(role: WorkspaceMemberRole): SeatType {
  if (role === "sales_manager" || role === "sales_rep" || role === "sales") return "sales";
  if (role === "project_viewer" || role === "viewer") return "viewer";
  return "designer";
}
