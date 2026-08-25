import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";

const db = createMemoryDb();

describe("RufsunCAD API security", () => {
  let app: INestApplication;

  beforeEach(async () => {
    db.reset();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db.prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  it("registers, protects /auth/me, and logs in", async () => {
    const registered = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: "Rohit", email: "rohit@example.com", password: "Password123" })
      .expect(201);

    await request(app.getHttpServer()).get("/api/auth/me").expect(401);
    await request(app.getHttpServer()).get("/api/auth/me").set("Authorization", `Bearer ${registered.body.accessToken}`).expect(200);
    await request(app.getHttpServer()).post("/api/auth/login").send({ email: "rohit@example.com", password: "wrong" }).expect(401);
    await request(app.getHttpServer()).post("/api/auth/login").send({ email: "rohit@example.com", password: "Password123" }).expect(201);
  });

  it("isolates workspace customers, projects, and documents", async () => {
    const userA = await register("a@example.com");
    const userB = await register("b@example.com");
    const workspaceA = await createWorkspace(userA.token, "Workspace A");
    const workspaceB = await createWorkspace(userB.token, "Workspace B");

    const customer = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceA.id}/customers`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Rajesh Sharma" })
      .expect(201);

    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceA.id}/projects`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ customerId: customer.body.id, name: "Rohini Residence", documentJson: sampleDoc() })
      .expect(201);

    await request(app.getHttpServer()).get(`/api/workspaces/${workspaceA.id}/customers`).set("Authorization", `Bearer ${userA.token}`).expect(200);
    await request(app.getHttpServer()).get(`/api/workspaces/${workspaceA.id}/customers`).set("Authorization", `Bearer ${userB.token}`).expect(403);
    await request(app.getHttpServer()).get(`/api/workspaces/${workspaceB.id}/projects/${project.body.id}`).set("Authorization", `Bearer ${userB.token}`).expect(404);
    await request(app.getHttpServer()).get(`/api/workspaces/${workspaceB.id}/projects/${project.body.id}/document`).set("Authorization", `Bearer ${userB.token}`).expect(404);

    await request(app.getHttpServer())
      .put(`/api/workspaces/${workspaceA.id}/projects/${project.body.id}/document`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ documentJson: sampleDoc(2), schemaVersion: "1" })
      .expect(200);
  });

  async function register(email: string) {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: email.split("@")[0], email, password: "Password123" })
      .expect(201);
    return { token: response.body.accessToken as string };
  }

  async function createWorkspace(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body as { id: string };
  }
});

function sampleDoc(panelCount = 1) {
  return {
    rufsunCadVersion: "0.2",
    version: "1",
    name: "Sample",
    units: "mm",
    layers: [],
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objects: Array.from({ length: panelCount }, (_, index) => ({ id: `p${index}`, type: "solarPanel", wattage: 550 }))
  };
}

function createMemoryDb() {
  let state = fresh();
  const prisma = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(async (actions: Promise<unknown>[]) => Promise.all(actions)),
    user: {
      findUnique: vi.fn(async ({ where }: any) => state.users.find((user) => user.email === where.email || user.id === where.id) ?? null),
      create: vi.fn(async ({ data }: any) => push(state.users, entity({ status: "active", ...data })))
    },
    refreshSession: {
      create: vi.fn(async ({ data }: any) => push(state.sessions, entity(data))),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.sessions, where.id), data)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        state.sessions.filter((session) => session.id === where.id).forEach((session) => Object.assign(session, data));
        return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const session = state.sessions.find((item) => item.id === where.id);
        return session && include?.user ? { ...session, user: state.users.find((user) => user.id === session.userId) } : session ?? null;
      })
    },
    workspaceMember: {
      findFirst: vi.fn(async ({ where }: any) => state.members.find((member) => member.userId === where.userId && member.workspaceId === where.workspaceId && member.status === where.status) ?? null),
      findMany: vi.fn(async ({ where }: any) => state.members.filter((member) => member.userId === where.userId).map((member) => ({ ...member, workspace: state.workspaces.find((workspace) => workspace.id === member.workspaceId) })))
    },
    workspace: {
      findFirst: vi.fn(async ({ where }: any) => state.workspaces.find((workspace) => workspace.id === where.id || workspace.slug === where.slug) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const workspace = push(state.workspaces, entity({ ...data, status: "active", slug: data.slug }));
        push(state.members, entity({ workspaceId: workspace.id, userId: data.members.create.userId, role: data.members.create.role, status: "active" }));
        return { ...workspace, members: state.members.filter((member) => member.workspaceId === workspace.id) };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.workspaces, where.id), data))
    },
    customer: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async ({ where }: any) => state.customers.filter((customer) => customer.workspaceId === where.workspaceId && !customer.archivedAt).map((customer) => ({ ...customer, _count: { projects: 0 } }))),
      create: vi.fn(async ({ data }: any) => push(state.customers, entity({ ...data, archivedAt: null }))),
      findFirst: vi.fn(async ({ where }: any) => state.customers.find((customer) => customer.id === where.id && customer.workspaceId === where.workspaceId && !customer.archivedAt) ?? null),
      findFirstOrThrow: vi.fn(async ({ where }: any) => {
        const customer = state.customers.find((item) => item.id === where.id && item.workspaceId === where.workspaceId);
        if (!customer) throw new Error("not found");
        return { ...customer, projects: state.projects.filter((project) => project.customerId === customer.id) };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.customers, where.id), data))
    },
    project: {
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { systemSizeKw: 0 } })),
      findMany: vi.fn(async ({ where }: any) => state.projects.filter((project) => project.workspaceId === where.workspaceId && !project.archivedAt)),
      create: vi.fn(async ({ data }: any) => {
        const project = push(state.projects, entity({ ...data, archivedAt: null }));
        const document = push(state.documents, entity({ workspaceId: data.workspaceId, projectId: project.id, ...data.document.create }));
        return { ...project, document, customer: state.customers.find((customer) => customer.id === project.customerId) };
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const project = state.projects.find((item) => item.id === where.id && item.workspaceId === where.workspaceId && !item.archivedAt);
        if (!project) return null;
        return include?.customer ? { ...project, customer: state.customers.find((customer) => customer.id === project.customerId) } : project;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.projects, where.id), data))
    },
    projectDocument: {
      findFirst: vi.fn(async ({ where }: any) => state.documents.find((document) => document.workspaceId === where.workspaceId && document.projectId === where.projectId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = state.documents.find((document) => document.projectId === where.projectId);
        if (existing) return Object.assign(existing, update);
        return push(state.documents, entity(create));
      })
    }
  };
  return { prisma, reset: () => (state = fresh()) };
}

function fresh() {
  return { users: [] as any[], sessions: [] as any[], workspaces: [] as any[], members: [] as any[], customers: [] as any[], projects: [] as any[], documents: [] as any[] };
}

function entity(data: any) {
  return { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
}

function push<T>(array: T[], item: T) {
  array.push(item);
  return item;
}

function find(array: any[], id: string) {
  const item = array.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing entity ${id}`);
  return item;
}
