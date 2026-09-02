import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { CommercialService } from "../commercial/commercial.service";
import { PrismaService } from "../prisma.service";
import type { CreateWorkspaceDto } from "../workspaces/dto/create-workspace.dto";
import type { UpdateWorkspaceDto } from "../workspaces/dto/update-workspace.dto";
import type { CreateTenantDto } from "./dto/create-tenant.dto";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";

export const DIRECT_TENANT_SLUG = "rufsun-direct";

@Injectable()
export class TenantsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async listForUser(userId: string) {
    if (await this.access.isPlatformAdmin(userId)) return this.adminList(userId);
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId, status: "active", tenant: { status: "active" } },
      include: { tenant: true },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map((membership) => ({ ...membership.tenant, role: membership.role }));
  }

  async adminList(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    return this.prisma.tenant.findMany({
      include: { _count: { select: { companies: true, memberships: true } } },
      orderBy: { createdAt: "asc" }
    });
  }

  async adminCreate(userId: string, dto: CreateTenantDto) {
    await this.access.requirePlatformAdmin(userId);
    const slug = await this.uniqueTenantSlug(dto.name);
    return this.prisma.tenant.create({
      data: {
        name: dto.name.trim(),
        slug,
        type: dto.type ?? "direct",
        status: "active"
      }
    });
  }

  async adminGet(userId: string, tenantId: string) {
    await this.access.requirePlatformAdmin(userId);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      include: { companies: { orderBy: { createdAt: "asc" } }, memberships: true }
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  async adminUpdate(userId: string, tenantId: string, dto: UpdateTenantDto) {
    await this.access.requirePlatformAdmin(userId);
    const data: Prisma.TenantUpdateInput = {
      name: dto.name?.trim(),
      type: dto.type,
      status: dto.status,
      archivedAt: dto.status === "archived" ? new Date() : undefined
    };
    if (dto.name) data.slug = await this.uniqueTenantSlug(dto.name, tenantId);
    return this.prisma.tenant.update({ where: { id: tenantId }, data });
  }

  async listCompanies(userId: string, tenantId: string) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_COMPANIES_VIEW);
    return this.prisma.company.findMany({
      where: { tenantId, archivedAt: null },
      include: { tenant: true, _count: { select: { customers: true, projects: true, members: true } } },
      orderBy: { createdAt: "asc" }
    });
  }

  async createCompany(userId: string, tenantId: string, dto: CreateWorkspaceDto) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_COMPANIES_CREATE);
    await this.ensureCompanyLimit(tenantId);
    const company = await this.createCompanyRecord(userId, tenantId, dto);
    return company;
  }

  async createDirectCompany(userId: string, dto: CreateWorkspaceDto) {
    const tenant = await this.ensureDirectTenant();
    await this.ensureTenantMembership(tenant.id, userId, "owner");
    const company = await this.createCompanyRecord(userId, tenant.id, dto);
    await this.commercial.ensureInternalCommercialForCompany(company.id, userId);
    return company;
  }

  async getCompany(userId: string, companyId: string) {
    if (await this.access.isPlatformAdmin(userId)) {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId },
        include: { tenant: true, _count: { select: { customers: true, projects: true, members: true } } }
      });
      if (!company) throw new NotFoundException("Company not found");
      return company;
    }
    await this.access.requireCompanyMembership(userId, companyId);
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  async updateCompany(userId: string, companyId: string, dto: UpdateWorkspaceDto) {
    await this.access.requireCompanyAdmin(userId, companyId);
    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Company not found");
    const data: Prisma.CompanyUpdateInput = {
      name: dto.name?.trim(),
      logoUrl: dto.logoUrl?.trim() || undefined,
      email: dto.email?.trim() || undefined,
      phone: dto.phone?.trim() || undefined,
      website: dto.website?.trim() || undefined,
      address: dto.address?.trim() || undefined,
      city: dto.city?.trim() || undefined,
      state: dto.state?.trim() || undefined,
      postalCode: dto.postalCode?.trim() || undefined,
      country: dto.country?.trim() || undefined
    };
    if (dto.name) data.slug = await this.uniqueCompanySlug(company.tenantId, dto.name, companyId);
    return this.prisma.company.update({ where: { id: companyId }, data, include: { tenant: true } });
  }

  async ensureDirectTenant() {
    return this.prisma.tenant.upsert({
      where: { slug: DIRECT_TENANT_SLUG },
      update: { name: "Rufsun Direct", type: "direct", status: "active" },
      create: { name: "Rufsun Direct", slug: DIRECT_TENANT_SLUG, type: "direct", status: "active" }
    });
  }

  private async createCompanyRecord(userId: string, tenantId: string, dto: CreateWorkspaceDto) {
    const slug = await this.uniqueCompanySlug(tenantId, dto.name);
    return this.prisma.company.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        website: dto.website?.trim() || null,
        createdById: userId,
        members: {
          create: {
            userId,
            role: "company_owner",
            seatType: "designer",
            status: "active",
            joinedAt: new Date()
          }
        }
      },
      include: { tenant: true, members: true }
    });
  }

  private async ensureTenantMembership(tenantId: string, userId: string, role: "owner" | "admin" | "billing" | "support" | "member") {
    await this.prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      update: {},
      create: { tenantId, userId, role, status: "active", joinedAt: new Date() }
    });
  }

  private async ensureCompanyLimit(tenantId: string) {
    const companies = await this.prisma.company.count({ where: { tenantId, archivedAt: null } });
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, scope: "tenant" },
      include: { plan: { include: { entitlements: true } } }
    });
    const companyLimit = subscription?.plan.entitlements.find((entitlement) => entitlement.key === "companies.max");
    if (companyLimit?.enabled && typeof companyLimit.limit === "number" && companies >= companyLimit.limit) {
      throw new ForbiddenException("This tenant has reached its company allowance.");
    }
  }

  private async uniqueTenantSlug(name: string, excludeTenantId?: string) {
    const base = slugify(name).slice(0, 42) || "tenant";
    let slug = base;
    let counter = 2;
    while (await this.prisma.tenant.findFirst({ where: { slug, id: excludeTenantId ? { not: excludeTenantId } : undefined } })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private async uniqueCompanySlug(tenantId: string, name: string, excludeCompanyId?: string) {
    const base = slugify(name).slice(0, 42) || "company";
    let slug = base;
    let counter = 2;
    while (
      await this.prisma.company.findFirst({
        where: { tenantId, slug, id: excludeCompanyId ? { not: excludeCompanyId } : undefined }
      })
    ) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
