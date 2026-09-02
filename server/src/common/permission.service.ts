import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Permission } from "./permissions";
import { companyRolePermissions, hasPermission, platformRolePermissions, tenantRolePermissions } from "./permissions";
import { PrismaService } from "../prisma.service";

@Injectable()
export class PermissionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "active") throw new UnauthorizedException("User account is not active");
    return user;
  }

  async hasPlatformPermission(userId: string, permission: Permission) {
    const user = await this.requireActiveUser(userId);
    return hasPermission(platformRolePermissions(user.platformRole), permission);
  }

  async requirePlatformPermission(userId: string, permission: Permission) {
    if (!(await this.hasPlatformPermission(userId, permission))) throw new ForbiddenException("You do not have permission to perform this action.");
  }

  async hasTenantPermission(userId: string, tenantId: string, permission: Permission) {
    const user = await this.requireActiveUser(userId);
    if (hasPermission(platformRolePermissions(user.platformRole), permission)) return true;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, status: "active", tenant: { status: "active" } }
    });
    return membership ? hasPermission(tenantRolePermissions(membership.role), permission) : false;
  }

  async requireTenantPermission(userId: string, tenantId: string, permission: Permission) {
    const user = await this.requireActiveUser(userId);
    if (hasPermission(platformRolePermissions(user.platformRole), permission)) {
      const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException("Tenant not found");
      return { user, tenant, platform: true };
    }
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId, status: "active", tenant: { status: "active" } },
      include: { tenant: true }
    });
    if (!membership) throw new ForbiddenException("Tenant access denied");
    if (!hasPermission(tenantRolePermissions(membership.role), permission)) throw new ForbiddenException("You do not have permission to perform this action.");
    return membership;
  }

  async hasCompanyPermission(userId: string, companyId: string, permission: Permission) {
    const user = await this.requireActiveUser(userId);
    if (hasPermission(platformRolePermissions(user.platformRole), permission)) return true;
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, status: "active", company: { status: "active", tenant: { status: "active" } } }
    });
    if (membership && hasPermission(companyRolePermissions(membership.role), permission)) return true;

    const company = await this.prisma.company.findFirst({ where: { id: companyId, status: "active", tenant: { status: "active" } } });
    if (!company) return false;
    const tenantMembership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId: company.tenantId, status: "active", tenant: { status: "active" } }
    });
    return tenantMembership ? hasPermission(tenantRolePermissions(tenantMembership.role), permission) : false;
  }

  async requireCompanyPermission(userId: string, companyId: string, permission: Permission) {
    const user = await this.requireActiveUser(userId);
    if (hasPermission(platformRolePermissions(user.platformRole), permission)) {
      const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
      if (!company) throw new NotFoundException("Company not found");
      return { user, company, platform: true };
    }
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, status: "active", company: { status: "active", tenant: { status: "active" } } },
      include: { company: { include: { tenant: true } } }
    });
    if (membership && hasPermission(companyRolePermissions(membership.role), permission)) return membership;

    const company = await this.prisma.company.findFirst({ where: { id: companyId, status: "active", tenant: { status: "active" } } });
    if (!company) throw new ForbiddenException("You do not have access to this company.");
    const tenantMembership = await this.prisma.tenantMembership.findFirst({
      where: { userId, tenantId: company.tenantId, status: "active", tenant: { status: "active" } }
    });
    if (tenantMembership && hasPermission(tenantRolePermissions(tenantMembership.role), permission)) return { userId, companyId, tenantId: company.tenantId, role: tenantMembership.role };

    throw new ForbiddenException("You do not have permission to perform this action.");
  }

  async permissionsForCompany(userId: string, companyId: string) {
    const user = await this.requireActiveUser(userId);
    const permissions = new Set<Permission>(platformRolePermissions(user.platformRole));
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, status: "active", company: { status: "active", tenant: { status: "active" } } },
      include: { company: true }
    });
    if (membership) companyRolePermissions(membership.role).forEach((permission) => permissions.add(permission));
    if (membership?.company?.tenantId) {
      const tenantMembership = await this.prisma.tenantMembership.findFirst({
        where: { userId, tenantId: membership.company.tenantId, status: "active", tenant: { status: "active" } }
      });
      if (tenantMembership) tenantRolePermissions(tenantMembership.role).forEach((permission) => permissions.add(permission));
    }
    return [...permissions];
  }
}
