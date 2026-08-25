import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@rufsun.local";
  const passwordHash = await bcrypt.hash("Demo12345", 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Demo Owner",
      email,
      passwordHash
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "rufsun-demo-solar" },
    update: {},
    create: {
      name: "Rufsun Demo Solar",
      slug: "rufsun-demo-solar",
      email: "hello@rufsun.local",
      phone: "+91 98765 43210",
      country: "India",
      createdById: user.id,
      members: {
        create: {
          userId: user.id,
          role: "owner",
          status: "active",
          joinedAt: new Date()
        }
      }
    }
  });

  const rajesh = await prisma.customer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      workspaceId: workspace.id,
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
      workspaceId: workspace.id,
      createdById: user.id,
      customerType: "business",
      name: "ABC Industries",
      companyName: "ABC Industries",
      phone: "9988776655",
      email: "ops@abc.example",
      address: "Noida, Uttar Pradesh"
    }
  });

  await seedProject(workspace.id, user.id, rajesh.id, "Rohini Residence", "Rohini, Delhi");
  await seedProject(workspace.id, user.id, abc.id, "Noida Factory", "Noida, Uttar Pradesh");

  console.log("Seeded RufsunCAD demo data");
  console.log("Login: demo@rufsun.local / Demo12345");
}

async function seedProject(workspaceId: string, userId: string, customerId: string, name: string, address: string) {
  const existing = await prisma.project.findFirst({ where: { workspaceId, customerId, name } });
  if (existing) return existing;
  const now = new Date().toISOString();
  return prisma.project.create({
    data: {
      workspaceId,
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
          workspaceId,
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
