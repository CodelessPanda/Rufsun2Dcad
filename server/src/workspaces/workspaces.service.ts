import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { CommercialService } from "../commercial/commercial.service";
import type { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import type { UpdateWorkspaceDto } from "./dto/update-workspace.dto";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, status: "active", company: { status: "active", tenant: { status: "active" } } },
      include: { company: { include: { tenant: true } } },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map((membership) => ({
      ...membership.company,
      workspaceId: membership.company.id,
      role: membership.role,
      seatType: membership.seatType
    }));
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const tenant = await this.ensureDirectTenant();
    const slug = await this.uniqueSlug(tenant.id, dto.name);
    const company = await this.prisma.company.create({
      data: {
        tenantId: tenant.id,
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
      include: { members: true, tenant: true }
    });
    await this.ensureTenantMembership(tenant.id, userId, "owner");
    await this.commercial.ensureInternalCommercialForCompany(company.id, userId);
    return { ...company, workspaceId: company.id };
  }

  async get(userId: string, workspaceId: string) {
    await this.access.requireCompanyMembership(userId, workspaceId, Permissions.COMPANY_VIEW);
    const company = await this.prisma.company.findFirst({ where: { id: workspaceId, status: "active" }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    return { ...company, workspaceId: company.id };
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.access.requireCompanyMembership(userId, workspaceId, Permissions.COMPANY_UPDATE);
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
    const company = await this.prisma.company.findUnique({ where: { id: workspaceId }, select: { tenantId: true } });
    if (dto.name && company) data.slug = await this.uniqueSlug(company.tenantId, dto.name, workspaceId);
    const updated = await this.prisma.company.update({ where: { id: workspaceId }, data, include: { tenant: true } });
    return { ...updated, workspaceId: updated.id };
  }

  async members(userId: string, workspaceId: string) {
    await this.access.requireCompanyMembership(userId, workspaceId, Permissions.COMPANY_MEMBERS_VIEW);
    return this.prisma.companyMembership.findMany({
      where: { companyId: workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });
  }

  async summary(userId: string, workspaceId: string) {
    await this.access.requireCompanyMembership(userId, workspaceId, Permissions.COMPANY_VIEW);
    const [customers, projects, activeProjects, capacity] = await Promise.all([
      this.prisma.customer.count({ where: { companyId: workspaceId, archivedAt: null } }),
      this.prisma.project.count({ where: { companyId: workspaceId, archivedAt: null } }),
      this.prisma.project.count({ where: { companyId: workspaceId, archivedAt: null, status: "active" } }),
      this.prisma.project.aggregate({
        where: { companyId: workspaceId, archivedAt: null },
        _sum: { systemSizeKw: true }
      })
    ]);
    return {
      customers,
      projects,
      activeProjects,
      totalDesignedCapacityKw: capacity._sum.systemSizeKw ?? 0
    };
  }

  private async uniqueSlug(tenantId: string, name: string, excludeCompanyId?: string) {
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

  private async ensureDirectTenant() {
    return this.prisma.tenant.upsert({
      where: { slug: "rufsun-direct" },
      update: { name: "Rufsun Direct", type: "direct", status: "active" },
      create: { name: "Rufsun Direct", slug: "rufsun-direct", type: "direct", status: "active" }
    });
  }

  private async ensureTenantMembership(tenantId: string, userId: string, role: "owner" | "admin" | "billing" | "support" | "member") {
    await this.prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      update: {},
      create: { tenantId, userId, role, status: "active", joinedAt: new Date() }
    });
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
