import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Permission } from "./permissions";
import { Permissions } from "./permissions";
import { PermissionService } from "./permission.service";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AccessControlService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionService) private readonly permissions: PermissionService
  ) {}

  async requirePlatformAdmin(userId: string) {
    const user = await this.permissions.requireActiveUser(userId);
    if (user.platformRole !== "super_admin") throw new ForbiddenException("Platform admin access denied");
    return user;
  }

  async requireTenantMembership(userId: string, tenantId: string, permission: Permission = Permissions.TENANT_VIEW) {
    return this.permissions.requireTenantPermission(userId, tenantId, permission);
  }

  async requireTenantAdmin(userId: string, tenantId: string) {
    return this.requireTenantMembership(userId, tenantId, Permissions.TENANT_COMPANIES_CREATE);
  }

  async requireCompanyMembership(userId: string, companyId: string, permission: Permission = Permissions.COMPANY_VIEW) {
    return this.permissions.requireCompanyPermission(userId, companyId, permission);
  }

  async requireCompanyAdmin(userId: string, companyId: string) {
    return this.requireCompanyMembership(userId, companyId, Permissions.COMPANY_UPDATE);
  }

  async requireDirectTenantMember(userId: string, tenantId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenantId,
        status: "active",
        tenant: { status: "active" }
      },
      include: { tenant: true }
    });
    if (!membership) throw new ForbiddenException("Tenant access denied");
    return membership;
  }

  async requireCompanyForAdmin(companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  async resolveCompanyTenant(companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    return company.tenant;
  }

  async assertCompanyBelongsToTenant(companyId: string, tenantId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, tenantId } });
    if (!company) throw new NotFoundException("Company not found in tenant");
    return company;
  }

  async requireCustomer(userId: string, companyId: string, customerId: string) {
    await this.requireCompanyMembership(userId, companyId, Permissions.CUSTOMER_VIEW);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, archivedAt: null }
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async requireProject(userId: string, companyId: string, projectId: string) {
    await this.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, archivedAt: null },
      include: { customer: true, company: { include: { tenant: true } } }
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async isPlatformAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
    return user?.platformRole === "super_admin";
  }
}
