import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Company, Tenant } from "@prisma/client";
import { AccessControlService } from "../common/access-control.service";
import { CommercialService } from "../commercial/commercial.service";
import { Entitlements } from "../commercial/commercial.constants";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async dashboard(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    const [tenants, companies, users, projects, subscriptions, usageMeters, recentProjects, recentCustomers, recentInvitations] = await Promise.all([
      this.prisma.tenant.findMany({
        include: {
          subscriptions: { include: { plan: { include: { entitlements: true } } } },
          companies: { include: { seatAllocations: true, members: true, _count: { select: { projects: true, members: true } } } },
          seatCapacities: true,
          usageMeters: true,
          _count: { select: { companies: true, memberships: true } }
        }
      }),
      this.prisma.company.findMany({ where: { archivedAt: null }, include: { members: true, seatAllocations: true, _count: { select: { projects: true, members: true } } } }),
      this.prisma.user.count(),
      this.prisma.project.count({ where: { archivedAt: null } }),
      this.prisma.subscription.findMany(),
      this.prisma.usageMeter.findMany({ where: { key: Entitlements.SOLAR_REQUESTS_MONTH } }),
      this.prisma.project.findMany({ where: { archivedAt: null }, include: { company: { include: { tenant: true } }, customer: true } }),
      this.prisma.customer.findMany({ where: { archivedAt: null } }),
      this.prisma.invitation.findMany({ where: { revokedAt: null } })
    ]);
    const designerSeats = summarizeSeats(companies, "designer");
    const solarUsage = usageMeters.reduce((sum, usage) => sum + (usage.count ?? 0), 0);
    const activeSubscriptions = subscriptions.filter((subscription) => ["trialing", "active", "grace_period"].includes(subscription.status)).length;

    return {
      metrics: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === "active").length,
        companies: companies.length,
        users,
        activeSubscriptions,
        designerSeats,
        solarApiUsage: solarUsage,
        projects
      },
      tenants: tenants.map((tenant) => ({
        ...tenant,
        commercial: commercialSnapshot(tenant)
      })),
      recentActivity: recentActivity(recentProjects, recentCustomers, recentInvitations)
    };
  }

  async companies(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    const companies = await this.prisma.company.findMany({
      where: { archivedAt: null },
      include: {
        tenant: true,
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } } },
        seatAllocations: true,
        usageMeters: true,
        _count: { select: { customers: true, projects: true, members: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return companies.map((company) => companySummary(company));
  }

  async company(userId: string, companyId: string) {
    await this.access.requirePlatformAdmin(userId);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      include: {
        tenant: true,
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, emailVerifiedAt: true } } } },
        seatAllocations: true,
        usageMeters: true,
        subscriptions: { include: { plan: { include: { entitlements: true } } } },
        _count: { select: { customers: true, projects: true, members: true } }
      }
    });
    if (!company) throw new NotFoundException("Company not found");
    const [licensing, projects, customers] = await Promise.all([
      this.commercial.companyLicensing(userId, companyId),
      this.prisma.project.findMany({ where: { companyId, archivedAt: null }, include: { customer: true } }),
      this.prisma.customer.findMany({ where: { companyId, archivedAt: null } })
    ]);
    return {
      ...companySummary(company),
      company,
      licensing,
      projects,
      customers
    };
  }

  async enterSupportMode(userId: string, companyId: string) {
    const user = await this.access.requirePlatformAdmin(userId);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      include: { tenant: true, _count: { select: { customers: true, projects: true, members: true } } }
    });
    if (!company) throw new NotFoundException("Company not found");
    return {
      active: true,
      startedAt: new Date().toISOString(),
      supportUser: { id: user.id, name: user.name, email: user.email },
      company: { ...company, workspaceId: company.id },
      tenant: company.tenant,
      banner: `Support Mode: Viewing ${company.name}`
    };
  }

  async exitSupportMode(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    return { active: false };
  }
}

function summarizeSeats(companies: Array<Company & { members?: any[]; seatAllocations?: any[] }>, seatType: string) {
  const allocated = companies.reduce((sum, company) => {
    const allocation = company.seatAllocations?.find((seat) => seat.seatType === seatType);
    return allocation?.unlimited ? sum : sum + (allocation?.allocated ?? 0);
  }, 0);
  const assigned = companies.reduce((sum, company) => sum + (company.members ?? []).filter((member) => member.status === "active" && member.seatType === seatType).length, 0);
  return { allocated, assigned };
}

function companySummary(company: any) {
  const designer = seatSummary(company, "designer");
  const sales = seatSummary(company, "sales");
  const primaryAdmin =
    company.members?.find((member: any) => member.role === "company_owner" && member.status === "active") ??
    company.members?.find((member: any) => member.status === "active");
  const solarUsage = (company.usageMeters ?? [])
    .filter((usage: any) => usage.key === Entitlements.SOLAR_REQUESTS_MONTH)
    .reduce((sum: number, usage: any) => sum + (usage.count ?? 0), 0);
  return {
    id: company.id,
    tenantId: company.tenantId,
    tenant: company.tenant,
    name: company.name,
    slug: company.slug,
    status: company.status,
    email: company.email,
    phone: company.phone,
    website: company.website,
    address: company.address,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    users: company._count?.members ?? company.members?.length ?? 0,
    projects: company._count?.projects ?? 0,
    customers: company._count?.customers ?? 0,
    primaryAdmin: primaryAdmin?.user ? { name: primaryAdmin.user.name, email: primaryAdmin.user.email } : null,
    designerSeats: designer,
    salesSeats: sales,
    solarUsage
  };
}

function seatSummary(company: any, seatType: string) {
  const allocation = company.seatAllocations?.find((seat: any) => seat.seatType === seatType);
  const assigned = (company.members ?? []).filter((member: any) => member.status === "active" && member.seatType === seatType).length;
  const unlimited = Boolean(allocation?.unlimited);
  const allocated = unlimited ? null : allocation?.allocated ?? 0;
  return {
    allocated,
    assigned,
    unlimited,
    available: unlimited ? null : Math.max(0, (allocated ?? 0) - assigned)
  };
}

function commercialSnapshot(tenant: Tenant & { subscriptions?: any[]; companies?: any[]; seatCapacities?: any[] }) {
  const subscription = tenant.subscriptions?.find((item) => item.scope === "tenant") ?? null;
  const plan = subscription?.plan ?? null;
  return {
    plan: plan ? { id: plan.id, code: plan.code, name: plan.name, description: plan.description } : null,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billingMode: subscription.billingMode,
          startsAt: subscription.startsAt,
          endsAt: subscription.endsAt,
          trialEndsAt: subscription.trialEndsAt,
          graceEndsAt: subscription.graceEndsAt
        }
      : null,
    seats: (tenant.seatCapacities ?? []).map((capacity) => ({
      seatType: capacity.seatType,
      total: capacity.total,
      unlimited: capacity.unlimited
    })),
    companies: tenant.companies?.length ?? 0
  };
}

function recentActivity(projects: any[], customers: any[], invitations: any[]) {
  return [
    ...projects.map((project) => ({
      type: "Project created",
      label: project.name,
      context: project.company?.name ?? project.customer?.name ?? "",
      at: project.createdAt
    })),
    ...customers.map((customer) => ({
      type: "Customer added",
      label: customer.name,
      context: customer.companyName ?? "",
      at: customer.createdAt
    })),
    ...invitations.map((invitation) => ({
      type: "Member invited",
      label: invitation.email,
      context: invitation.scope,
      at: invitation.createdAt
    }))
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);
}
