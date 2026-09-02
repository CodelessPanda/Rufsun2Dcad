import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { COMMERCIAL_SEATS, PLAN_DEFINITIONS } from "../src/commercial/commercial.constants";

const prisma = new PrismaClient();

async function main() {
  await seedPlans();
  const email = "demo@rufsun.local";
  const passwordHash = await bcrypt.hash("Demo12345", 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Demo Owner",
      email,
      passwordHash,
      emailVerifiedAt: new Date()
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@rufsun.local" },
    update: { platformRole: "super_admin" },
    create: {
      name: "Rufsun Super Admin",
      email: "admin@rufsun.local",
      passwordHash: await bcrypt.hash("Admin12345", 12),
      platformRole: "super_admin",
      emailVerifiedAt: new Date()
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "rufsun-direct" },
    update: { name: "Rufsun Direct", type: "direct", status: "active" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Rufsun Direct",
      slug: "rufsun-direct",
      type: "direct",
      status: "active"
    }
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "owner", status: "active", joinedAt: new Date() },
    create: { tenantId: tenant.id, userId: user.id, role: "owner", status: "active", joinedAt: new Date() }
  });

  const company = await prisma.company.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "rufsun-demo-solar" } },
    update: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      name: "Rufsun Demo Solar",
      slug: "rufsun-demo-solar",
      email: "hello@rufsun.local",
      phone: "+91 98765 43210",
      country: "India",
      createdById: user.id,
      members: {
        create: {
          userId: user.id,
          role: "company_owner",
          seatType: "designer",
          status: "active",
          joinedAt: new Date()
        }
      }
    }
  });

  await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: { role: "company_owner", seatType: "designer", status: "active", joinedAt: new Date() },
    create: { companyId: company.id, userId: user.id, role: "company_owner", seatType: "designer", status: "active", joinedAt: new Date() }
  });

  await seedInternalCommercial(tenant.id, company.id, user.id);

  const rajesh = await prisma.customer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      companyId: company.id,
      createdById: user.id,
      name: "Rajesh Sharma",
      phone: "9876543210",
      email: "rajesh@example.com",
      address: "Rohini, Delhi",
      notes: "Residential rooftop solar customer."
    }
  });

  const abc = await prisma.customer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000102" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000102",
      companyId: company.id,
      createdById: user.id,
      customerType: "business",
      name: "ABC Industries",
      companyName: "ABC Industries",
      phone: "9988776655",
      email: "ops@abc.example",
      address: "Noida, Uttar Pradesh"
    }
  });

  await seedProject(company.id, user.id, rajesh.id, "Rohini Residence", "Rohini, Delhi");
  await seedProject(company.id, user.id, abc.id, "Noida Factory", "Noida, Uttar Pradesh");

  console.log("Seeded RufsunCAD demo data");
  console.log("Login: demo@rufsun.local / Demo12345");
  console.log("Super admin: admin@rufsun.local / Admin12345");
}

async function seedPlans() {
  for (const definition of PLAN_DEFINITIONS) {
    const plan = await prisma.plan.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
        isActive: true
      },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
        isActive: true
      }
    });
    for (const entitlement of definition.entitlements) {
      await prisma.planEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key: entitlement.key } },
        update: {
          enabled: entitlement.enabled ?? true,
          limit: entitlement.limit ?? null
        },
        create: {
          planId: plan.id,
          key: entitlement.key,
          enabled: entitlement.enabled ?? true,
          limit: entitlement.limit ?? null
        }
      });
    }
  }
}

async function seedInternalCommercial(tenantId: string, companyId: string, userId: string) {
  const plan = await prisma.plan.findUnique({ where: { code: "internal" } });
  if (!plan) return;
  await prisma.subscription.upsert({
    where: { companyId },
    update: { planId: plan.id, status: "active", billingMode: "manual" },
    create: {
      scope: "company",
      tenantId,
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
      prisma.companySeatAllocation.upsert({
        where: { companyId_seatType: { companyId, seatType } },
        update: { allocated: null, unlimited: true },
        create: { companyId, seatType, allocated: null, unlimited: true }
      })
    )
  );
}

async function seedProject(companyId: string, userId: string, customerId: string, name: string, address: string) {
  const existing = await prisma.project.findFirst({ where: { companyId, customerId, name } });
  if (existing) return existing;
  const now = new Date().toISOString();
  return prisma.project.create({
    data: {
      companyId,
      customerId,
      name,
      address,
      status: "active",
      createdById: userId,
      updatedById: userId,
      systemSizeKw: 0,
      panelCount: 0,
      document: {
        create: {
          companyId,
          schemaVersion: "1",
          documentJson: {
            rufsunCadVersion: "0.2",
            version: "1.0.0",
            name,
            customerName: name,
            customerAddress: address,
            units: "mm",
            objects: [],
            layers: [],
            settings: { grid: { visible: true, minor: 304.8, major: 1524 }, snap: {}, activeLayerId: "roof" },
            createdAt: now,
            updatedAt: now
          }
        }
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
