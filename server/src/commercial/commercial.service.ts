import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Plan, SeatType, Subscription } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { COMMERCIAL_SEATS, Entitlements, PLAN_DEFINITIONS, type EntitlementKey } from "./commercial.constants";
import type { UpdateCompanyAllocationDto, UpdateSeatCapacityDto, UpsertTenantSubscriptionDto } from "./dto/commercial.dto";

const VALID_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "grace_period"]);

@Injectable()
export class CommercialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService
  ) {}

  async plans(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    return this.prisma.plan.findMany({ include: { entitlements: true }, orderBy: { code: "asc" } });
  }

  async adminOverview(userId: string) {
    await this.access.requirePlatformAdmin(userId);
    const tenants = await this.prisma.tenant.findMany({
      include: {
        subscriptions: { include: { plan: { include: { entitlements: true } } } },
        companies: { include: { seatAllocations: true, _count: { select: { members: true, projects: true } } } },
        seatCapacities: true,
        usageMeters: true,
        _count: { select: { companies: true, memberships: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    return tenants.map((tenant) => ({
      ...tenant,
      commercial: summarizeTenantCommercial(tenant)
    }));
  }

  async upsertTenantSubscription(userId: string, tenantId: string, dto: UpsertTenantSubscriptionDto) {
    await this.access.requirePlatformAdmin(userId);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new NotFoundException("Plan not found. Run seed to create system plans.");
    const data = subscriptionData(plan.id, userId, dto);
    return this.prisma.subscription.upsert({
      where: { tenantId_scope: { tenantId, scope: "tenant" } },
      update: data,
      create: {
        tenantId,
        scope: "tenant",
        ...data
      },
      include: { plan: { include: { entitlements: true } } }
    });
  }

  async updateTenantCapacity(userId: string, tenantId: string, dto: UpdateSeatCapacityDto) {
    await this.access.requirePlatformAdmin(userId);
    await this.ensureTenantExists(tenantId);
    if (dto.seatType === "no_seat") throw new BadRequestException("No Seat does not require capacity.");
    const unlimited = Boolean(dto.unlimited);
    const total = unlimited ? null : dto.total ?? 0;
    const allocated = await this.allocatedTenantSeats(tenantId, dto.seatType);
    if (!unlimited && allocated > (total ?? 0)) {
      throw new BadRequestException(`Cannot reduce ${seatLabel(dto.seatType)} capacity below ${allocated} allocated seats.`);
    }
    return this.prisma.tenantSeatCapacity.upsert({
      where: { tenantId_seatType: { tenantId, seatType: dto.seatType } },
      update: { total, unlimited },
      create: { tenantId, seatType: dto.seatType, total, unlimited }
    });
  }

  async tenantLicensing(userId: string, tenantId: string) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_LICENSES_VIEW);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      include: {
        subscriptions: { include: { plan: { include: { entitlements: true } } } },
        seatCapacities: true,
        companies: { include: { seatAllocations: true, members: true, _count: { select: { members: true, projects: true } } } },
        usageMeters: true
      }
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return summarizeTenantCommercial(tenant);
  }

  async updateCompanyAllocation(userId: string, tenantId: string, companyId: string, dto: UpdateCompanyAllocationDto) {
    await this.access.requireTenantMembership(userId, tenantId, Permissions.TENANT_LICENSES_MANAGE);
    const company = await this.prisma.company.findFirst({ where: { id: companyId, tenantId }, include: { members: true } });
    if (!company) throw new NotFoundException("Company not found in tenant");
    if (dto.seatType === "no_seat") throw new BadRequestException("No Seat does not require allocation.");
    const unlimited = Boolean(dto.unlimited);
    const allocated = unlimited ? null : dto.allocated ?? 0;
    const assigned = company.members.filter((member) => member.status === "active" && member.seatType === dto.seatType).length;
    if (!unlimited && assigned > (allocated ?? 0)) {
      throw new BadRequestException(`Cannot reduce ${seatLabel(dto.seatType)} allocation below ${assigned} assigned seats.`);
    }
    await this.ensureTenantCapacityAvailable(tenantId, companyId, dto.seatType, allocated, unlimited);
    return this.prisma.companySeatAllocation.upsert({
      where: { companyId_seatType: { companyId, seatType: dto.seatType } },
      update: { allocated, unlimited },
      create: { companyId, seatType: dto.seatType, allocated, unlimited }
    });
  }

  async companyLicensing(userId: string, companyId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.COMPANY_MEMBERS_VIEW);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      include: {
        tenant: true,
        members: true,
        seatAllocations: true,
        subscriptions: { include: { plan: { include: { entitlements: true } } } },
        usageMeters: true
      }
    });
    if (!company) throw new NotFoundException("Company not found");
    const commercial = await this.commercialForCompany(companyId);
    return {
      companyId,
      tenantId: company.tenantId,
      subscription: commercial.subscription ? safeSubscription(commercial.subscription) : null,
      plan: commercial.plan ? safePlan(commercial.plan) : null,
      subscriptionValid: Boolean(commercial.subscription && isSubscriptionUsable(commercial.subscription)),
      entitlements: commercial.entitlements,
      seats: summarizeCompanySeats(company),
      usage: await this.usageSummary(company.tenantId, companyId)
    };
  }

  async requireCompanyEntitlement(companyId: string, entitlement: EntitlementKey) {
    const commercial = await this.commercialForCompany(companyId);
    if (!commercial.subscription || !isSubscriptionUsable(commercial.subscription)) {
      throw new ForbiddenException("Your subscription is not active. Contact your distributor or Rufsun admin.");
    }
    const value = commercial.entitlements[entitlement];
    if (!value?.enabled) throw new ForbiddenException(commercialError(entitlement));
    return value;
  }

  async getCompanyLimit(companyId: string, entitlement: EntitlementKey) {
    const value = await this.requireCompanyEntitlement(companyId, entitlement);
    return typeof value.limit === "number" ? value.limit : null;
  }

  async requireSeatAssignable(companyId: string, seatType: SeatType, excludingMembershipId?: string) {
    if (seatType === "no_seat") return;
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { members: true, seatAllocations: true } });
    if (!company) throw new NotFoundException("Company not found");
    const allocation = company.seatAllocations.find((item) => item.seatType === seatType);
    if (!allocation) throw new BadRequestException(`No ${seatLabel(seatType)} seats are allocated to this company.`);
    if (allocation.unlimited) return;
    const assigned = company.members.filter((member) => member.status === "active" && member.seatType === seatType && member.id !== excludingMembershipId).length;
    if (assigned + 1 > (allocation.allocated ?? 0)) {
      throw new BadRequestException(`All ${seatLabel(seatType)} seats are currently assigned.`);
    }
  }

  async ensureInternalCommercialForCompany(companyId: string, userId?: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, include: { tenant: true } });
    if (!company) throw new NotFoundException("Company not found");
    const plan = await this.prisma.plan.findUnique({ where: { code: "internal" } });
    if (!plan) return;
    await this.prisma.subscription.upsert({
      where: { companyId },
      update: { planId: plan.id, status: "active", billingMode: "manual" },
      create: {
        scope: "company",
        tenantId: company.tenantId,
        companyId,
        planId: plan.id,
        status: "active",
        billingMode: "manual",
        startsAt: new Date(),
        createdById: userId
      }
    });
    await Promise.all(
      COMMERCIAL_SEATS.map((seatType) =>
        this.prisma.companySeatAllocation.upsert({
          where: { companyId_seatType: { companyId, seatType } },
          update: { allocated: null, unlimited: true },
          create: { companyId, seatType, allocated: null, unlimited: true }
        })
      )
    );
  }

  async recordSolarRequest(companyId: string) {
    await this.requireSolarRequestAvailable(companyId);
    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Company not found");
    const periodStart = monthStart();
    return this.prisma.usageMeter.upsert({
      where: {
        tenantId_companyId_key_periodStart: {
          tenantId: company.tenantId,
          companyId,
          key: Entitlements.SOLAR_REQUESTS_MONTH,
          periodStart
        }
      },
      update: { count: { increment: 1 } },
      create: { tenantId: company.tenantId, companyId, key: Entitlements.SOLAR_REQUESTS_MONTH, periodStart, count: 1 }
    });
  }

  async requireSolarRequestAvailable(companyId: string) {
    await this.requireCompanyEntitlement(companyId, Entitlements.SOLAR_IRRADIANCE);
    const limit = await this.getCompanyLimit(companyId, Entitlements.SOLAR_REQUESTS_MONTH);
    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Company not found");
    const periodStart = monthStart();
    const current = await this.prisma.usageMeter.findFirst({
      where: { tenantId: company.tenantId, companyId, key: Entitlements.SOLAR_REQUESTS_MONTH, periodStart }
    });
    if (typeof limit === "number" && (current?.count ?? 0) >= limit) {
      throw new ForbiddenException("Your Solar API allowance has been reached for this month.");
    }
  }

  private async commercialForCompany(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId },
      include: {
        subscriptions: { include: { plan: { include: { entitlements: true } } } },
        tenant: { include: { subscriptions: { include: { plan: { include: { entitlements: true } } } } } }
      }
    });
    if (!company) throw new NotFoundException("Company not found");
    const companySubscription = company.subscriptions.find((subscription) => subscription.scope === "company");
    const tenantSubscription = company.tenant.subscriptions.find((subscription) => subscription.scope === "tenant");
    const subscription = companySubscription ?? tenantSubscription ?? null;
    const plan = subscription?.plan ?? null;
    return {
      company,
      subscription,
      plan,
      entitlements: entitlementsFromPlan(plan)
    };
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  private async allocatedTenantSeats(tenantId: string, seatType: SeatType, excludingCompanyId?: string) {
    const companies = await this.prisma.company.findMany({
      where: { tenantId },
      include: { seatAllocations: true }
    });
    return companies.reduce((sum, company) => {
      if (company.id === excludingCompanyId) return sum;
      const allocation = company.seatAllocations.find((item) => item.seatType === seatType);
      if (!allocation || allocation.unlimited) return sum;
      return sum + (allocation.allocated ?? 0);
    }, 0);
  }

  private async ensureTenantCapacityAvailable(tenantId: string, excludingCompanyId: string, seatType: SeatType, allocation: number | null, unlimited: boolean) {
    const capacity = await this.prisma.tenantSeatCapacity.findUnique({ where: { tenantId_seatType: { tenantId, seatType } } });
    if (!capacity) throw new BadRequestException(`No ${seatLabel(seatType)} capacity is available for this tenant.`);
    if (capacity.unlimited) return;
    if (unlimited) throw new BadRequestException(`Company ${seatLabel(seatType)} allocation cannot be unlimited because tenant capacity is limited.`);
    const alreadyAllocated = await this.allocatedTenantSeats(tenantId, seatType, excludingCompanyId);
    if (alreadyAllocated + (allocation ?? 0) > (capacity.total ?? 0)) {
      throw new BadRequestException(`Tenant has only ${Math.max(0, (capacity.total ?? 0) - alreadyAllocated)} ${seatLabel(seatType)} seats available.`);
    }
  }

  private async usageSummary(tenantId: string, companyId: string) {
    const periodStart = monthStart();
    const solarUsage = await this.prisma.usageMeter.findFirst({ where: { tenantId, companyId, key: Entitlements.SOLAR_REQUESTS_MONTH, periodStart } });
    return {
      solarRequestsMonth: {
        used: solarUsage?.count ?? 0,
        periodStart: periodStart.toISOString()
      }
    };
  }
}

function subscriptionData(planId: string, userId: string, dto: UpsertTenantSubscriptionDto) {
  return {
    planId,
    status: dto.status ?? "active",
    billingMode: dto.billingMode ?? "manual",
    trialStartsAt: dto.trialStartsAt ? new Date(dto.trialStartsAt) : undefined,
    trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
    startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
    endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    graceEndsAt: dto.graceEndsAt ? new Date(dto.graceEndsAt) : undefined,
    notes: dto.notes,
    createdById: userId
  };
}

function summarizeTenantCommercial(tenant: any) {
  const subscription = tenant.subscriptions?.find((item: Subscription) => item.scope === "tenant") ?? null;
  const plan = subscription?.plan ?? null;
  const companies = tenant.companies ?? [];
  return {
    tenantId: tenant.id,
    subscription: subscription ? safeSubscription(subscription) : null,
    plan: plan ? safePlan(plan) : null,
    subscriptionValid: Boolean(subscription && isSubscriptionUsable(subscription)),
    entitlements: entitlementsFromPlan(plan),
    capacities: COMMERCIAL_SEATS.map((seatType) => {
      const capacity = tenant.seatCapacities?.find((item: any) => item.seatType === seatType);
      const allocated = companies.reduce((sum: number, company: any) => {
        const allocation = company.seatAllocations?.find((item: any) => item.seatType === seatType);
        return allocation?.unlimited ? sum : sum + (allocation?.allocated ?? 0);
      }, 0);
      return {
        seatType,
        total: capacity?.total ?? null,
        unlimited: Boolean(capacity?.unlimited || seatType === "viewer"),
        allocated,
        available: capacity?.unlimited || seatType === "viewer" ? null : Math.max(0, (capacity?.total ?? 0) - allocated)
      };
    }),
    companies: companies.map((company: any) => ({
      id: company.id,
      name: company.name,
      status: company.status,
      allocations: summarizeCompanySeats(company),
      memberCount: company._count?.members ?? company.members?.length ?? 0,
      projectCount: company._count?.projects ?? 0
    }))
  };
}

function summarizeCompanySeats(company: any) {
  return COMMERCIAL_SEATS.map((seatType) => {
    const allocation = company.seatAllocations?.find((item: any) => item.seatType === seatType);
    const assigned = (company.members ?? []).filter((member: any) => member.status === "active" && member.seatType === seatType).length;
    const unlimited = Boolean(allocation?.unlimited || seatType === "viewer");
    const allocated = unlimited ? null : allocation?.allocated ?? 0;
    return {
      seatType,
      allocated,
      unlimited,
      assigned,
      available: unlimited ? null : Math.max(0, (allocated ?? 0) - assigned)
    };
  });
}

function entitlementsFromPlan(plan: (Plan & { entitlements?: Array<{ key: string; enabled: boolean; limit: number | null }> }) | null) {
  const entitlements: Record<string, { enabled: boolean; limit: number | null }> = {};
  for (const definition of PLAN_DEFINITIONS.flatMap((plan) => plan.entitlements)) {
    entitlements[definition.key] = { enabled: false, limit: null };
  }
  for (const entitlement of plan?.entitlements ?? []) {
    entitlements[entitlement.key] = { enabled: entitlement.enabled, limit: entitlement.limit ?? null };
  }
  return entitlements;
}

function safePlan(plan: Plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description
  };
}

function safeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    scope: subscription.scope,
    status: subscription.status,
    billingMode: subscription.billingMode,
    trialStartsAt: subscription.trialStartsAt,
    trialEndsAt: subscription.trialEndsAt,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt,
    graceEndsAt: subscription.graceEndsAt,
    canceledAt: subscription.canceledAt,
    notes: subscription.notes
  };
}

function isSubscriptionUsable(subscription: Subscription) {
  if (!VALID_SUBSCRIPTION_STATUSES.has(subscription.status)) return false;
  const now = Date.now();
  if (subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() < now) return false;
  if (subscription.status === "active" && subscription.endsAt && subscription.endsAt.getTime() < now) return false;
  if (subscription.status === "grace_period" && subscription.graceEndsAt && subscription.graceEndsAt.getTime() < now) return false;
  return true;
}

function commercialError(entitlement: EntitlementKey) {
  if (entitlement === Entitlements.SOLAR_IRRADIANCE) return "Your company does not have access to Solar Irradiance.";
  if (entitlement === Entitlements.CAD_ACCESS) return "Your company does not have access to CAD design.";
  if (entitlement === Entitlements.CAD_EDIT) return "Your company does not have access to CAD editing.";
  if (entitlement === Entitlements.LAYOUT_AUTO_FILL) return "Your company does not have access to Auto Fill.";
  if (entitlement === Entitlements.REPORTS_ADVANCED) return "Your company does not have access to advanced reports.";
  return "Your subscription does not include this feature.";
}

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function seatLabel(seatType: SeatType) {
  if (seatType === "designer") return "Designer";
  if (seatType === "sales") return "Sales";
  if (seatType === "viewer") return "Viewer";
  return "No Seat";
}
