import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { Entitlements, PLAN_DEFINITIONS } from "../src/commercial/commercial.constants";
import { PrismaService } from "../src/prisma.service";

let currentState = fresh();
const db = createMemoryDb();
vi.setConfig({ testTimeout: 20000 });

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

  it("isolates company customers, projects, documents, and solar routes", async () => {
    const userA = await register("a@example.com");
    const userB = await register("b@example.com");
    const companyA = await createCompany(userA.token, "Company A");
    const companyB = await createCompany(userB.token, "Company B");

    const customer = await request(app.getHttpServer())
      .post(`/api/companies/${companyA.id}/customers`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Rajesh Sharma" })
      .expect(201);

    const project = await request(app.getHttpServer())
      .post(`/api/companies/${companyA.id}/projects`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ customerId: customer.body.id, name: "Rohini Residence", documentJson: sampleDoc() })
      .expect(201);

    await request(app.getHttpServer()).get(`/api/companies/${companyA.id}/customers`).set("Authorization", `Bearer ${userA.token}`).expect(200);
    await request(app.getHttpServer()).get(`/api/companies/${companyA.id}/customers`).set("Authorization", `Bearer ${userB.token}`).expect(403);
    await request(app.getHttpServer()).get(`/api/companies/${companyB.id}/projects/${project.body.id}`).set("Authorization", `Bearer ${userB.token}`).expect(404);
    await request(app.getHttpServer()).get(`/api/companies/${companyB.id}/projects/${project.body.id}/document`).set("Authorization", `Bearer ${userB.token}`).expect(404);
    await request(app.getHttpServer()).get(`/api/companies/${companyB.id}/projects/${project.body.id}/solar/data-layers`).set("Authorization", `Bearer ${userB.token}`).expect(404);

    await request(app.getHttpServer())
      .put(`/api/companies/${companyA.id}/projects/${project.body.id}/document`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ documentJson: sampleDoc(2), schemaVersion: "1" })
      .expect(200);
  });

  it("rejects projects that cross-link a customer from another company", async () => {
    const userA = await register("cross-a@example.com");
    const userB = await register("cross-b@example.com");
    const companyA = await createCompany(userA.token, "Cross Company A");
    const companyB = await createCompany(userB.token, "Cross Company B");
    const customerB = await request(app.getHttpServer())
      .post(`/api/companies/${companyB.id}/customers`)
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ name: "Other Company Customer" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/companies/${companyA.id}/projects`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ customerId: customerB.body.id, name: "Invalid Project", documentJson: sampleDoc() })
      .expect(404);
  });

  it("lets a platform super admin manage tenants without company membership", async () => {
    const admin = await register("admin@example.com");
    const normal = await register("normal-admin-block@example.com");
    db.setPlatformRole("admin@example.com", "super_admin");

    const tenant = await request(app.getHttpServer())
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Distributor ABC", type: "distributor" })
      .expect(201);

    await request(app.getHttpServer()).get("/api/admin/tenants").set("Authorization", `Bearer ${admin.token}`).expect(200);
    await request(app.getHttpServer()).get("/api/admin/dashboard").set("Authorization", `Bearer ${admin.token}`).expect(200);
    await request(app.getHttpServer()).get("/api/admin/companies").set("Authorization", `Bearer ${admin.token}`).expect(200);
    await request(app.getHttpServer()).get("/api/admin/dashboard").set("Authorization", `Bearer ${normal.token}`).expect(403);
    await request(app.getHttpServer()).get(`/api/admin/tenants/${tenant.body.id}`).set("Authorization", `Bearer ${admin.token}`).expect(200);
    const company = await request(app.getHttpServer())
      .post(`/api/tenants/${tenant.body.id}/companies`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Solar Company 1" })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/companies/${company.body.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
  });

  it("allows only super admins to enter support mode for a company", async () => {
    const admin = await register("support-super@example.com");
    const normal = await register("support-normal@example.com");
    db.setPlatformRole("support-super@example.com", "super_admin");
    const company = await createCompany(normal.token, "Support Mode Company");

    const support = await request(app.getHttpServer())
      .post(`/api/admin/support-mode/companies/${company.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(201);

    expect(support.body.active).toBe(true);
    expect(support.body.supportUser.email).toBe("support-super@example.com");
    expect(support.body.company.id).toBe(company.id);
    await request(app.getHttpServer())
      .post(`/api/admin/support-mode/companies/${company.id}`)
      .set("Authorization", `Bearer ${normal.token}`)
      .expect(403);
  });

  it("allows tenant admins to create companies only inside their tenant", async () => {
    const admin = await register("platform@example.com");
    db.setPlatformRole("platform@example.com", "super_admin");
    const tenantAdmin = await register("tenant-admin@example.com");
    const ownCompany = await createCompany(tenantAdmin.token, "Tenant Admin Company");
    const otherTenant = await request(app.getHttpServer())
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Other Tenant", type: "distributor" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/tenants/${ownCompany.tenantId}/companies`)
      .set("Authorization", `Bearer ${tenantAdmin.token}`)
      .send({ name: "Second Own Company" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/tenants/${otherTenant.body.id}/companies`)
      .set("Authorization", `Bearer ${tenantAdmin.token}`)
      .send({ name: "Blocked Company" })
      .expect(403);
  });

  it("supports switching between two companies without leaking scoped data", async () => {
    const user = await register("switcher@example.com");
    const companyA = await createCompany(user.token, "Switch Company A");
    const companyB = await createCompany(user.token, "Switch Company B");
    await request(app.getHttpServer()).post(`/api/companies/${companyA.id}/customers`).set("Authorization", `Bearer ${user.token}`).send({ name: "A Customer" }).expect(201);
    await request(app.getHttpServer()).post(`/api/companies/${companyB.id}/customers`).set("Authorization", `Bearer ${user.token}`).send({ name: "B Customer" }).expect(201);

    const customersA = await request(app.getHttpServer()).get(`/api/companies/${companyA.id}/customers`).set("Authorization", `Bearer ${user.token}`).expect(200);
    const customersB = await request(app.getHttpServer()).get(`/api/companies/${companyB.id}/customers`).set("Authorization", `Bearer ${user.token}`).expect(200);

    expect(customersA.body.map((customer: { name: string }) => customer.name)).toEqual(["A Customer"]);
    expect(customersB.body.map((customer: { name: string }) => customer.name)).toEqual(["B Customer"]);
  });

  it("blocks normal operations for suspended tenants and suspended companies", async () => {
    const user = await register("suspended@example.com");
    const company = await createCompany(user.token, "Suspended Company");

    db.setCompanyStatus(company.id, "suspended");
    await request(app.getHttpServer()).get(`/api/companies/${company.id}/customers`).set("Authorization", `Bearer ${user.token}`).expect(403);

    db.setCompanyStatus(company.id, "active");
    db.setTenantStatus(company.tenantId, "suspended");
    await request(app.getHttpServer()).get(`/api/companies/${company.id}/customers`).set("Authorization", `Bearer ${user.token}`).expect(403);
  });

  it("enforces role permissions and seat capabilities for CAD document writes", async () => {
    const owner = await register("owner@example.com");
    const viewer = await register("viewer@example.com");
    const company = await createCompany(owner.token, "Permission Company");
    const customer = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/customers`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Permission Customer" })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/projects`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ customerId: customer.body.id, name: "Permission Project", documentJson: sampleDoc() })
      .expect(201);

    const invitation = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/invitations`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "viewer@example.com", role: "designer", seatType: "viewer" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${tokenFromUrl(invitation.body.invitationUrl)}/accept`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(201);

    await request(app.getHttpServer()).get(`/api/companies/${company.id}/projects`).set("Authorization", `Bearer ${viewer.token}`).expect(200);
    await request(app.getHttpServer())
      .put(`/api/companies/${company.id}/projects/${project.body.id}/document`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ documentJson: sampleDoc(3), schemaVersion: "1" })
      .expect(403);

    const members = await request(app.getHttpServer()).get(`/api/companies/${company.id}/members`).set("Authorization", `Bearer ${owner.token}`).expect(200);
    const viewerMembership = members.body.members.find((member: { user: { email: string } }) => member.user.email === "viewer@example.com");
    await request(app.getHttpServer())
      .patch(`/api/companies/${company.id}/members/${viewerMembership.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ seatType: "designer" })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/companies/${company.id}/projects/${project.body.id}/document`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ documentJson: sampleDoc(3), schemaVersion: "1" })
      .expect(200);
  });

  it("handles invitation wrong-email and duplicate acceptance safely", async () => {
    const owner = await register("invite-owner@example.com");
    const invitee = await register("invitee@example.com");
    const wrongUser = await register("wrong@example.com");
    const company = await createCompany(owner.token, "Invite Company");
    const invitation = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/invitations`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "invitee@example.com", role: "sales_rep", seatType: "sales" })
      .expect(201);
    const token = tokenFromUrl(invitation.body.invitationUrl);

    await request(app.getHttpServer()).get(`/api/invitations/${token}`).expect(200);
    expect(invitation.body.tokenHash).toBeUndefined();
    await request(app.getHttpServer()).post(`/api/invitations/${token}/accept`).set("Authorization", `Bearer ${wrongUser.token}`).expect(403);
    await request(app.getHttpServer()).post(`/api/invitations/${token}/accept`).set("Authorization", `Bearer ${invitee.token}`).expect(201);
    await request(app.getHttpServer()).post(`/api/invitations/${token}/accept`).set("Authorization", `Bearer ${invitee.token}`).expect(400);
  });

  it("supports password reset without exposing whether an email exists", async () => {
    await register("reset@example.com");
    const reset = await request(app.getHttpServer())
      .post("/api/auth/password/forgot")
      .send({ email: "reset@example.com" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/auth/password/forgot")
      .send({ email: "missing@example.com" })
      .expect(201);

    const token = tokenFromUrl(reset.body.resetUrl);
    await request(app.getHttpServer()).post("/api/auth/password/reset").send({ token: "bad-token", password: "NewPassword123" }).expect(400);
    await request(app.getHttpServer()).post("/api/auth/password/reset").send({ token, password: "NewPassword123" }).expect(201);
    await request(app.getHttpServer()).post("/api/auth/password/reset").send({ token, password: "AnotherPassword123" }).expect(400);
    await request(app.getHttpServer()).post("/api/auth/login").send({ email: "reset@example.com", password: "NewPassword123" }).expect(201);
  });

  it("protects the final company owner from removal", async () => {
    const owner = await register("last-owner@example.com");
    const company = await createCompany(owner.token, "Final Owner Company");
    const members = await request(app.getHttpServer()).get(`/api/companies/${company.id}/members`).set("Authorization", `Bearer ${owner.token}`).expect(200);
    await request(app.getHttpServer())
      .delete(`/api/companies/${company.id}/members/${members.body.members[0].id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(400);
  });

  it("enforces tenant seat capacity when allocating seats to companies", async () => {
    const admin = await register("phase4-capacity-admin@example.com");
    db.setPlatformRole("phase4-capacity-admin@example.com", "super_admin");
    const tenant = await createTenant(admin.token, "Capacity Tenant");
    await assignTenantPlan(admin.token, tenant.id, "distributor");
    await setTenantCapacity(admin.token, tenant.id, "designer", 10);
    const companyA = await createTenantCompany(admin.token, tenant.id, "Capacity Company A");
    const companyB = await createTenantCompany(admin.token, tenant.id, "Capacity Company B");

    await setCompanyAllocation(admin.token, tenant.id, companyA.id, "designer", 6).expect(200);
    await setCompanyAllocation(admin.token, tenant.id, companyB.id, "designer", 5).expect(400);
  });

  it("allows tenant admins to allocate seats inside their own capacity", async () => {
    const platform = await register("phase5-capacity-platform@example.com");
    const tenantAdmin = await register("phase5-tenant-owner@example.com");
    db.setPlatformRole("phase5-capacity-platform@example.com", "super_admin");
    const ownerCompany = await createCompany(tenantAdmin.token, "Phase 5 Owner Company");
    await setTenantCapacity(platform.token, ownerCompany.tenantId, "designer", 4);
    const managedCompany = await createTenantCompany(tenantAdmin.token, ownerCompany.tenantId, "Phase 5 Managed Company");

    await setCompanyAllocation(tenantAdmin.token, ownerCompany.tenantId, managedCompany.id, "designer", 3).expect(200);
    await setCompanyAllocation(tenantAdmin.token, ownerCompany.tenantId, managedCompany.id, "designer", 5).expect(400);
  });

  it("enforces company seat allocation when assigning a third designer", async () => {
    const admin = await register("phase4-seat-admin@example.com");
    const second = await register("phase4-seat-second@example.com");
    const third = await register("phase4-seat-third@example.com");
    db.setPlatformRole("phase4-seat-admin@example.com", "super_admin");
    const tenant = await createTenant(admin.token, "Seat Tenant");
    await assignTenantPlan(admin.token, tenant.id, "distributor");
    await setTenantCapacity(admin.token, tenant.id, "designer", 2);
    const company = await createTenantCompany(admin.token, tenant.id, "Seat Company");
    await setCompanyAllocation(admin.token, tenant.id, company.id, "designer", 2).expect(200);

    const inviteSecond = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/invitations`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ email: "phase4-seat-second@example.com", role: "designer", seatType: "designer" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${tokenFromUrl(inviteSecond.body.invitationUrl)}/accept`)
      .set("Authorization", `Bearer ${second.token}`)
      .expect(201);

    const inviteThird = await request(app.getHttpServer())
      .post(`/api/companies/${company.id}/invitations`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ email: "phase4-seat-third@example.com", role: "designer", seatType: "designer" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${tokenFromUrl(inviteThird.body.invitationUrl)}/accept`)
      .set("Authorization", `Bearer ${third.token}`)
      .expect(400);
  });

  it("gates Solar API loading by entitlement", async () => {
    const admin = await register("phase4-solar-admin@example.com");
    db.setPlatformRole("phase4-solar-admin@example.com", "super_admin");
    const tenant = await createTenant(admin.token, "Solar Entitlement Tenant");
    await assignTenantPlan(admin.token, tenant.id, "starter");
    const company = await createTenantCompany(admin.token, tenant.id, "Solar Entitlement Company");
    const customer = await createCustomer(admin.token, company.id, "Solar Customer");
    const project = await createProject(admin.token, company.id, customer.body.id, "Solar Entitlement Project", 28.6, 77.2);

    await request(app.getHttpServer())
      .get(`/api/companies/${company.id}/projects/${project.body.id}/solar/data-layers`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(403);

    process.env.GOOGLE_SOLAR_API_KEY = "solar-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=abc", imageryQuality: "HIGH" })));
    await assignTenantPlan(admin.token, tenant.id, "professional");
    await request(app.getHttpServer())
      .get(`/api/companies/${company.id}/projects/${project.body.id}/solar/data-layers`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
  });

  it("enforces monthly Solar API quota before making the third external request", async () => {
    const admin = await register("phase4-quota-admin@example.com");
    db.setPlatformRole("phase4-quota-admin@example.com", "super_admin");
    db.setEntitlementLimit("professional", Entitlements.SOLAR_REQUESTS_MONTH, 2);
    const tenant = await createTenant(admin.token, "Quota Tenant");
    await assignTenantPlan(admin.token, tenant.id, "professional");
    const company = await createTenantCompany(admin.token, tenant.id, "Quota Company");
    const customer = await createCustomer(admin.token, company.id, "Quota Customer");
    const projectA = await createProject(admin.token, company.id, customer.body.id, "Quota Project A", 28.6, 77.2);
    const projectB = await createProject(admin.token, company.id, customer.body.id, "Quota Project B", 28.61, 77.21);
    const projectC = await createProject(admin.token, company.id, customer.body.id, "Quota Project C", 28.62, 77.22);
    const fetchMock = vi.fn(async () => jsonResponse(200, { annualFluxUrl: "https://solar.googleapis.com/v1/geoTiff:get?id=abc", imageryQuality: "HIGH" }));

    process.env.GOOGLE_SOLAR_API_KEY = "solar-key";
    vi.stubGlobal("fetch", fetchMock);
    await request(app.getHttpServer()).get(`/api/companies/${company.id}/projects/${projectA.body.id}/solar/data-layers`).set("Authorization", `Bearer ${admin.token}`).expect(200);
    await request(app.getHttpServer()).get(`/api/companies/${company.id}/projects/${projectB.body.id}/solar/data-layers`).set("Authorization", `Bearer ${admin.token}`).expect(200);
    await request(app.getHttpServer()).get(`/api/companies/${company.id}/projects/${projectC.body.id}/solar/data-layers`).set("Authorization", `Bearer ${admin.token}`).expect(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks tenant admins from modifying another tenant commercial account", async () => {
    const platform = await register("phase4-platform@example.com");
    const tenantAdmin = await register("phase4-tenant-admin@example.com");
    db.setPlatformRole("phase4-platform@example.com", "super_admin");
    const ownCompany = await createCompany(tenantAdmin.token, "Tenant Isolation Owner Company");
    const otherTenant = await createTenant(platform.token, "Other Commercial Tenant");
    const otherCompany = await createTenantCompany(platform.token, otherTenant.id, "Other Commercial Company");

    await request(app.getHttpServer())
      .patch(`/api/admin/tenants/${otherTenant.id}/subscription`)
      .set("Authorization", `Bearer ${tenantAdmin.token}`)
      .send({ planCode: "professional", status: "active" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tenants/${otherTenant.id}/companies/${otherCompany.id}/seat-allocation`)
      .set("Authorization", `Bearer ${tenantAdmin.token}`)
      .send({ seatType: "designer", allocated: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/tenants/${ownCompany.tenantId}/companies/${otherCompany.id}/seat-allocation`)
      .set("Authorization", `Bearer ${tenantAdmin.token}`)
      .send({ seatType: "designer", allocated: 1 })
      .expect(404);
  });

  it("blocks a company admin from assigning seats to another company's users", async () => {
    const userA = await register("phase4-company-a@example.com");
    const userB = await register("phase4-company-b@example.com");
    const companyA = await createCompany(userA.token, "Commercial Company A");
    const companyB = await createCompany(userB.token, "Commercial Company B");
    const membersB = await request(app.getHttpServer()).get(`/api/companies/${companyB.id}/members`).set("Authorization", `Bearer ${userB.token}`).expect(200);

    await request(app.getHttpServer())
      .patch(`/api/companies/${companyB.id}/members/${membersB.body.members[0].id}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ seatType: "sales" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/companies/${companyA.id}/members/${membersB.body.members[0].id}`)
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ seatType: "sales" })
      .expect(404);
  });

  it("keeps entitled designers able to open and save CAD documents", async () => {
    const user = await register("phase4-cad@example.com");
    const company = await createCompany(user.token, "Commercial CAD Company");
    const customer = await createCustomer(user.token, company.id, "CAD Customer");
    const project = await createProject(user.token, company.id, customer.body.id, "Commercial CAD Project", 28.6, 77.2);

    await request(app.getHttpServer()).get(`/api/companies/${company.id}/projects/${project.body.id}/document`).set("Authorization", `Bearer ${user.token}`).expect(200);
    await request(app.getHttpServer())
      .put(`/api/companies/${company.id}/projects/${project.body.id}/document`)
      .set("Authorization", `Bearer ${user.token}`)
      .send({ documentJson: sampleDoc(4), schemaVersion: "1" })
      .expect(200);
  });

  async function register(email: string) {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ name: email.split("@")[0], email, password: "Password123" })
      .expect(201);
    return { token: response.body.accessToken as string };
  }

  async function createCompany(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body as { id: string; tenantId: string };
  }

  async function createTenant(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${token}`)
      .send({ name, type: "distributor" })
      .expect(201);
    return response.body as { id: string };
  }

  async function createTenantCompany(token: string, tenantId: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/tenants/${tenantId}/companies`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);
    return response.body as { id: string; tenantId: string };
  }

  async function assignTenantPlan(token: string, tenantId: string, planCode: string) {
    return request(app.getHttpServer())
      .patch(`/api/admin/tenants/${tenantId}/subscription`)
      .set("Authorization", `Bearer ${token}`)
      .send({ planCode, status: "active" })
      .expect(200);
  }

  async function setTenantCapacity(token: string, tenantId: string, seatType: string, total: number) {
    return request(app.getHttpServer())
      .patch(`/api/admin/tenants/${tenantId}/seat-capacity`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatType, total, unlimited: false })
      .expect(200);
  }

  function setCompanyAllocation(token: string, tenantId: string, companyId: string, seatType: string, allocated: number) {
    return request(app.getHttpServer())
      .patch(`/api/tenants/${tenantId}/companies/${companyId}/seat-allocation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatType, allocated, unlimited: false });
  }

  async function createCustomer(token: string, companyId: string, name: string) {
    return request(app.getHttpServer())
      .post(`/api/companies/${companyId}/customers`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);
  }

  async function createProject(token: string, companyId: string, customerId: string, name: string, latitude?: number, longitude?: number) {
    return request(app.getHttpServer())
      .post(`/api/companies/${companyId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ customerId, name, latitude, longitude, documentJson: sampleDoc() })
      .expect(201);
  }
});

function tokenFromUrl(url: string) {
  return decodeURIComponent(url.split("/").pop() ?? "");
}

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

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function createMemoryDb() {
  let state = fresh();
  currentState = state;
  const prisma = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(async (actions: Promise<unknown>[]) => Promise.all(actions)),
    user: {
      findUnique: vi.fn(async ({ where, select }: any) => pick(state.users.find((user) => user.email === where.email || user.id === where.id) ?? null, select)),
      count: vi.fn(async () => state.users.length),
      create: vi.fn(async ({ data }: any) => push(state.users, entity({ status: "active", platformRole: "user", ...data }))),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.users, where.id), withoutUndefined(data)))
    },
    refreshSession: {
      create: vi.fn(async ({ data }: any) => push(state.sessions, entity(data))),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.sessions, where.id), withoutUndefined(data))),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const sessions = state.sessions.filter((session) => matchSession(session, where));
        sessions.forEach((session) => Object.assign(session, withoutUndefined(data)));
        return { count: sessions.length };
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const session = state.sessions.find((item) => item.id === where.id);
        return session && include?.user ? { ...session, user: state.users.find((user) => user.id === session.userId) } : session ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => state.sessions.filter((session) => matchSession(session, where)))
    },
    emailVerificationToken: {
      create: vi.fn(async ({ data }: any) => push(state.emailVerificationTokens, entity(data))),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const token = state.emailVerificationTokens.find((item) => item.tokenHash === where.tokenHash);
        return token && include?.user ? { ...token, user: find(state.users, token.userId) } : token ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.emailVerificationTokens, where.id), withoutUndefined(data)))
    },
    passwordResetToken: {
      create: vi.fn(async ({ data }: any) => push(state.passwordResetTokens, entity(data))),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const token = state.passwordResetTokens.find((item) => item.tokenHash === where.tokenHash);
        return token && include?.user ? { ...token, user: find(state.users, token.userId) } : token ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.passwordResetTokens, where.id), withoutUndefined(data)))
    },
    tenant: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.tenants.find((tenant) => tenant.slug === where.slug);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.tenants, entity({ status: "active", ...create }));
      }),
      findMany: vi.fn(async ({ where, include }: any = {}) => state.tenants.filter((tenant) => matchTenant(tenant, where)).map((tenant) => includeTenant(tenant, include))),
      create: vi.fn(async ({ data }: any) => push(state.tenants, entity({ status: "active", ...data }))),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const tenant = state.tenants.find((tenant) => matchTenant(tenant, where));
        return tenant ? includeTenant(tenant, include) : null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.tenants, where.id), withoutUndefined(data)))
    },
    tenantMembership: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.tenantMemberships.find((membership) => membership.tenantId === where.tenantId_userId.tenantId && membership.userId === where.tenantId_userId.userId);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.tenantMemberships, entity(create));
      }),
      findMany: vi.fn(async ({ where, include }: any) =>
        state.tenantMemberships
          .filter((membership) => matchTenantMembership(membership, where))
          .map((membership) => (include?.tenant ? { ...membership, tenant: state.tenants.find((tenant) => tenant.id === membership.tenantId) } : membership))
      ),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const membership = state.tenantMemberships.find((membership) => matchTenantMembership(membership, where));
        return membership && include?.tenant ? { ...membership, tenant: state.tenants.find((tenant) => tenant.id === membership.tenantId) } : membership ?? null;
      }),
      update: vi.fn(async ({ where, data, include }: any) => includeTenantMembership(Object.assign(find(state.tenantMemberships, where.id), withoutUndefined(data)), include))
    },
    companyMembership: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.companyMemberships.find((membership) => membership.companyId === where.companyId_userId.companyId && membership.userId === where.companyId_userId.userId);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.companyMemberships, entity(create));
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const membership = state.companyMemberships.find((membership) => matchCompanyMembership(membership, where));
        if (!membership) return null;
        return includeCompanyMembership(membership, include);
      }),
      findMany: vi.fn(async ({ where, include }: any) =>
        state.companyMemberships
          .filter((membership) => matchCompanyMembership(membership, where))
          .map((membership) => includeCompanyMembership(membership, include))
      ),
      update: vi.fn(async ({ where, data, include }: any) => includeCompanyMembership(Object.assign(find(state.companyMemberships, where.id), withoutUndefined(data)), include))
    },
    company: {
      count: vi.fn(async ({ where }: any) => state.companies.filter((company) => matchCompany(company, where)).length),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const company = state.companies.find((company) => matchCompany(company, where));
        return company ? includeCompany(company, include) : null;
      }),
      findUnique: vi.fn(async ({ where, select }: any) => pick(state.companies.find((company) => company.id === where.id) ?? null, select)),
      findMany: vi.fn(async ({ where, include }: any = {}) => state.companies.filter((company) => matchCompany(company, where)).map((company) => includeCompany(company, include))),
      create: vi.fn(async ({ data, include }: any) => {
        const company = push(state.companies, entity({ status: "active", archivedAt: null, ...data }));
        if (data.members?.create) push(state.companyMemberships, entity({ companyId: company.id, ...data.members.create }));
        return includeCompany(company, include);
      }),
      update: vi.fn(async ({ where, data, include }: any) => includeCompany(Object.assign(find(state.companies, where.id), withoutUndefined(data)), include))
    },
    customer: {
      count: vi.fn(async ({ where }: any) => state.customers.filter((customer) => matchCustomer(customer, where)).length),
      findMany: vi.fn(async ({ where }: any) =>
        state.customers.filter((customer) => matchCustomer(customer, where)).map((customer) => ({
          ...customer,
          _count: { projects: state.projects.filter((project) => project.customerId === customer.id && !project.archivedAt).length }
        }))
      ),
      create: vi.fn(async ({ data }: any) => push(state.customers, entity({ ...data, archivedAt: null }))),
      findFirst: vi.fn(async ({ where }: any) => state.customers.find((customer) => matchCustomer(customer, where)) ?? null),
      findFirstOrThrow: vi.fn(async ({ where }: any) => {
        const customer = state.customers.find((item) => matchCustomer(item, where));
        if (!customer) throw new Error("not found");
        return { ...customer, projects: state.projects.filter((project) => project.customerId === customer.id) };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.customers, where.id), withoutUndefined(data)))
    },
    project: {
      count: vi.fn(async ({ where }: any) => state.projects.filter((project) => matchProject(project, where)).length),
      aggregate: vi.fn(async ({ where }: any) => ({
        _sum: { systemSizeKw: state.projects.filter((project) => matchProject(project, where)).reduce((sum, project) => sum + (project.systemSizeKw ?? 0), 0) }
      })),
      findMany: vi.fn(async ({ where, include }: any) =>
        state.projects.filter((project) => matchProject(project, where)).map((project) => ({
          ...project,
          ...(include?.customer ? { customer: state.customers.find((customer) => customer.id === project.customerId) } : {}),
          ...(include?.company ? { company: includeCompany(find(state.companies, project.companyId), include.company.include) } : {})
        }))
      ),
      create: vi.fn(async ({ data, include }: any) => {
        const project = push(state.projects, entity({ ...data, archivedAt: null }));
        const document = push(state.documents, entity({ companyId: data.companyId, projectId: project.id, ...data.document.create }));
        return {
          ...project,
          document,
          customer: state.customers.find((customer) => customer.id === project.customerId),
          ...(include?.company ? { company: find(state.companies, project.companyId) } : {})
        };
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const project = state.projects.find((item) => matchProject(item, where));
        if (!project) return null;
        return {
          ...project,
          ...(include?.customer ? { customer: state.customers.find((customer) => customer.id === project.customerId) } : {}),
          ...(include?.company ? { company: includeCompany(find(state.companies, project.companyId), include.company.include) } : {})
        };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(find(state.projects, where.id), withoutUndefined(data)))
    },
    projectDocument: {
      findFirst: vi.fn(async ({ where }: any) => state.documents.find((document) => matchDocument(document, where)) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = state.documents.find((document) => document.projectId === where.projectId);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.documents, entity(create));
      })
    },
    invitation: {
      create: vi.fn(async ({ data }: any) => push(state.invitations, entity(data))),
      findMany: vi.fn(async ({ where }: any) => state.invitations.filter((invitation) => matchInvitation(invitation, where))),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const invitation = state.invitations.find((item) => item.tokenHash === where.tokenHash || item.id === where.id);
        return invitation ? includeInvitation(invitation, include) : null;
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const invitation = state.invitations.find((item) => matchInvitation(item, where));
        return invitation ? includeInvitation(invitation, include) : null;
      }),
      update: vi.fn(async ({ where, data, include }: any) => includeInvitation(Object.assign(find(state.invitations, where.id), withoutUndefined(data)), include))
    },
    plan: {
      findMany: vi.fn(async ({ include }: any = {}) => state.plans.map((plan) => includePlan(plan, include))),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const plan = state.plans.find((item) => item.code === where.code || item.id === where.id);
        return plan ? includePlan(plan, include) : null;
      }),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.plans.find((plan) => plan.code === where.code);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.plans, entity(create));
      })
    },
    planEntitlement: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.planEntitlements.find((item) => item.planId === where.planId_key.planId && item.key === where.planId_key.key);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.planEntitlements, entity(create));
      })
    },
    subscription: {
      findMany: vi.fn(async ({ where, include }: any = {}) => state.subscriptions.filter((item) => matchSubscription(item, where)).map((subscription) => includeSubscription(subscription, include))),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const subscription = state.subscriptions.find((item) => matchSubscription(item, where));
        return subscription ? includeSubscription(subscription, include) : null;
      }),
      upsert: vi.fn(async ({ where, update, create, include }: any) => {
        const existing = state.subscriptions.find((item) =>
          where.companyId ? item.companyId === where.companyId : item.tenantId === where.tenantId_scope?.tenantId && item.scope === where.tenantId_scope?.scope
        );
        if (existing) return includeSubscription(Object.assign(existing, withoutUndefined(update)), include);
        return includeSubscription(push(state.subscriptions, entity(create)), include);
      })
    },
    tenantSeatCapacity: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.tenantSeatCapacities.find((item) => item.tenantId === where.tenantId_seatType.tenantId && item.seatType === where.tenantId_seatType.seatType) ?? null
      ),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.tenantSeatCapacities.find((item) => item.tenantId === where.tenantId_seatType.tenantId && item.seatType === where.tenantId_seatType.seatType);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.tenantSeatCapacities, entity(create));
      })
    },
    companySeatAllocation: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = state.companySeatAllocations.find((item) => item.companyId === where.companyId_seatType.companyId && item.seatType === where.companyId_seatType.seatType);
        if (existing) return Object.assign(existing, withoutUndefined(update));
        return push(state.companySeatAllocations, entity(create));
      })
    },
    usageMeter: {
      findMany: vi.fn(async ({ where }: any = {}) => state.usageMeters.filter((item) => matchUsageMeter(item, where))),
      findFirst: vi.fn(async ({ where }: any) => state.usageMeters.find((item) => matchUsageMeter(item, where)) ?? null),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const key = where.tenantId_companyId_key_periodStart;
        const existing = state.usageMeters.find((item) => item.tenantId === key.tenantId && item.companyId === key.companyId && item.key === key.key && sameTime(item.periodStart, key.periodStart));
        if (existing) {
          if (update.count?.increment) existing.count += update.count.increment;
          else Object.assign(existing, withoutUndefined(update));
          return existing;
        }
        return push(state.usageMeters, entity(create));
      })
    }
  };
  return {
    prisma,
    reset: () => {
      state = fresh();
      currentState = state;
    },
    setPlatformRole: (email: string, platformRole: string) => Object.assign(findBy(state.users, "email", email), { platformRole }),
    setTenantStatus: (tenantId: string, status: string) => Object.assign(find(state.tenants, tenantId), { status }),
    setCompanyStatus: (companyId: string, status: string) => Object.assign(find(state.companies, companyId), { status }),
    setEntitlementLimit: (planCode: string, key: string, limit: number | null) => {
      const plan = state.plans.find((item) => item.code === planCode);
      if (!plan) throw new Error(`Missing plan ${planCode}`);
      const entitlement = state.planEntitlements.find((item) => item.planId === plan.id && item.key === key);
      if (!entitlement) throw new Error(`Missing entitlement ${key}`);
      entitlement.limit = limit;
    }
  };
}

function fresh() {
  const commercial = freshCommercialData();
  return {
    users: [] as any[],
    sessions: [] as any[],
    tenants: [] as any[],
    tenantMemberships: [] as any[],
    companies: [] as any[],
    companyMemberships: [] as any[],
    invitations: [] as any[],
    plans: commercial.plans,
    planEntitlements: commercial.planEntitlements,
    subscriptions: [] as any[],
    tenantSeatCapacities: [] as any[],
    companySeatAllocations: [] as any[],
    usageMeters: [] as any[],
    emailVerificationTokens: [] as any[],
    passwordResetTokens: [] as any[],
    customers: [] as any[],
    projects: [] as any[],
    documents: [] as any[]
  };
}

function freshCommercialData() {
  const plans: any[] = [];
  const planEntitlements: any[] = [];
  PLAN_DEFINITIONS.forEach((definition) => {
    const plan = entity({
      code: definition.code,
      name: definition.name,
      description: definition.description,
      isSystem: true,
      isActive: true
    });
    plans.push(plan);
    definition.entitlements.forEach((entitlement) => {
      planEntitlements.push(
        entity({
          planId: plan.id,
          key: entitlement.key,
          enabled: entitlement.enabled ?? true,
          limit: entitlement.limit ?? null
        })
      );
    });
  });
  return { plans, planEntitlements };
}

function matchTenant(tenant: any, where: any = {}) {
  if (!where) return true;
  if (where.id && tenant.id !== where.id) return false;
  if (where.slug && tenant.slug !== where.slug) return false;
  if (where.status && tenant.status !== where.status) return false;
  return true;
}

function matchTenantMembership(membership: any, where: any = {}) {
  const tenant = currentState.tenants.find((tenant) => tenant.id === membership.tenantId);
  if (where.id && membership.id !== where.id) return false;
  if (where.userId && membership.userId !== where.userId) return false;
  if (where.tenantId && membership.tenantId !== where.tenantId) return false;
  if (where.status && membership.status !== where.status) return false;
  if (where.tenant?.status && tenant?.status !== where.tenant.status) return false;
  if (where.role && typeof where.role === "string" && membership.role !== where.role) return false;
  if (where.role?.in && !where.role.in.includes(membership.role)) return false;
  return true;
}

function matchCompanyMembership(membership: any, where: any = {}) {
  const company = currentState.companies.find((company) => company.id === membership.companyId);
  const tenant = company ? currentState.tenants.find((tenant) => tenant.id === company.tenantId) : null;
  if (where.id && membership.id !== where.id) return false;
  if (where.userId && membership.userId !== where.userId) return false;
  if (where.companyId && membership.companyId !== where.companyId) return false;
  if (where.status && membership.status !== where.status) return false;
  if (where.role && typeof where.role === "string" && membership.role !== where.role) return false;
  if (where.role?.in && !where.role.in.includes(membership.role)) return false;
  if (where.company?.status && company?.status !== where.company.status) return false;
  if (where.company?.tenant?.status && tenant?.status !== where.company.tenant.status) return false;
  return true;
}

function matchSession(session: any, where: any = {}) {
  if (!where) return true;
  if (where.id && typeof where.id === "string" && session.id !== where.id) return false;
  if (where.id?.not && session.id === where.id.not) return false;
  if (where.userId && session.userId !== where.userId) return false;
  if (where.revokedAt === null && session.revokedAt) return false;
  return true;
}

function matchCompany(company: any, where: any = {}) {
  const tenant = currentState.tenants.find((tenant) => tenant.id === company.tenantId);
  if (!where) return true;
  if (where.id && typeof where.id === "string" && company.id !== where.id) return false;
  if (where.id?.not && company.id === where.id.not) return false;
  if (where.tenantId && company.tenantId !== where.tenantId) return false;
  if (where.slug && company.slug !== where.slug) return false;
  if (where.status && company.status !== where.status) return false;
  if (where.archivedAt === null && company.archivedAt) return false;
  if (where.tenant?.status && tenant?.status !== where.tenant.status) return false;
  return true;
}

function matchCustomer(customer: any, where: any = {}) {
  if (where.id && customer.id !== where.id) return false;
  if (where.companyId && customer.companyId !== where.companyId) return false;
  if (where.archivedAt === null && customer.archivedAt) return false;
  return true;
}

function matchProject(project: any, where: any = {}) {
  if (where.id && project.id !== where.id) return false;
  if (where.companyId && project.companyId !== where.companyId) return false;
  if (where.customerId && project.customerId !== where.customerId) return false;
  if (where.status && project.status !== where.status) return false;
  if (where.archivedAt === null && project.archivedAt) return false;
  return true;
}

function matchDocument(document: any, where: any = {}) {
  if (where.companyId && document.companyId !== where.companyId) return false;
  if (where.projectId && document.projectId !== where.projectId) return false;
  return true;
}

function matchInvitation(invitation: any, where: any = {}) {
  if (!where) return true;
  if (where.id && invitation.id !== where.id) return false;
  if (where.email && invitation.email !== where.email) return false;
  if (where.scope && invitation.scope !== where.scope) return false;
  if (where.tenantId && invitation.tenantId !== where.tenantId) return false;
  if (where.companyId && invitation.companyId !== where.companyId) return false;
  if (where.acceptedAt === null && invitation.acceptedAt) return false;
  if (where.revokedAt === null && invitation.revokedAt) return false;
  return true;
}

function matchSubscription(subscription: any, where: any = {}) {
  if (!where) return true;
  if (where.tenantId && subscription.tenantId !== where.tenantId) return false;
  if (where.companyId && subscription.companyId !== where.companyId) return false;
  if (where.scope && subscription.scope !== where.scope) return false;
  return true;
}

function matchUsageMeter(usage: any, where: any = {}) {
  if (!where) return true;
  if (where.tenantId && usage.tenantId !== where.tenantId) return false;
  if (where.companyId && usage.companyId !== where.companyId) return false;
  if (where.key && usage.key !== where.key) return false;
  if (where.periodStart && !sameTime(usage.periodStart, where.periodStart)) return false;
  return true;
}

function includeTenant(tenant: any, include: any): any {
  if (!include) return tenant;
  return {
    ...tenant,
    ...(include.companies ? { companies: currentState.companies.filter((company) => company.tenantId === tenant.id).map((company) => includeCompany(company, include.companies.include)) } : {}),
    ...(include.memberships ? { memberships: currentState.tenantMemberships.filter((membership) => membership.tenantId === tenant.id) } : {}),
    ...(include.subscriptions ? { subscriptions: currentState.subscriptions.filter((subscription) => subscription.tenantId === tenant.id).map((subscription) => includeSubscription(subscription, include.subscriptions.include)) } : {}),
    ...(include.seatCapacities ? { seatCapacities: currentState.tenantSeatCapacities.filter((capacity) => capacity.tenantId === tenant.id) } : {}),
    ...(include.usageMeters ? { usageMeters: currentState.usageMeters.filter((usage) => usage.tenantId === tenant.id) } : {}),
    ...(include._count ? { _count: { companies: currentState.companies.filter((company) => company.tenantId === tenant.id).length, memberships: currentState.tenantMemberships.filter((membership) => membership.tenantId === tenant.id).length } } : {})
  };
}

function includeCompany(company: any, include: any): any {
  if (!include) return company;
  return {
    ...company,
    ...(include.tenant ? { tenant: includeTenant(find(currentState.tenants, company.tenantId), include.tenant.include) } : {}),
    ...(include.members ? { members: currentState.companyMemberships.filter((membership) => membership.companyId === company.id).map((membership) => includeCompanyMembership(membership, include.members.include)) } : {}),
    ...(include.seatAllocations ? { seatAllocations: currentState.companySeatAllocations.filter((allocation) => allocation.companyId === company.id) } : {}),
    ...(include.subscriptions ? { subscriptions: currentState.subscriptions.filter((subscription) => subscription.companyId === company.id).map((subscription) => includeSubscription(subscription, include.subscriptions.include)) } : {}),
    ...(include.usageMeters ? { usageMeters: currentState.usageMeters.filter((usage) => usage.companyId === company.id) } : {}),
    ...(include._count ? { _count: { customers: currentState.customers.filter((customer) => customer.companyId === company.id).length, projects: currentState.projects.filter((project) => project.companyId === company.id).length, members: currentState.companyMemberships.filter((membership) => membership.companyId === company.id).length } } : {})
  };
}

function includeTenantMembership(membership: any, include: any) {
  return include?.user ? { ...membership, user: pick(find(currentState.users, membership.userId), include.user.select) } : membership;
}

function includeCompanyMembership(membership: any, include: any) {
  return {
    ...membership,
    ...(include?.company ? { company: includeCompany(find(currentState.companies, membership.companyId), include.company.include) } : {}),
    ...(include?.user ? { user: pick(find(currentState.users, membership.userId), include.user.select) } : {})
  };
}

function includeInvitation(invitation: any, include: any) {
  return {
    ...invitation,
    ...(include?.tenant && invitation.tenantId ? { tenant: find(currentState.tenants, invitation.tenantId) } : {}),
    ...(include?.company && invitation.companyId ? { company: find(currentState.companies, invitation.companyId) } : {})
  };
}

function includePlan(plan: any, include: any) {
  return {
    ...plan,
    ...(include?.entitlements ? { entitlements: currentState.planEntitlements.filter((entitlement) => entitlement.planId === plan.id) } : {})
  };
}

function includeSubscription(subscription: any, include: any) {
  return {
    ...subscription,
    ...(include?.plan ? { plan: includePlan(find(currentState.plans, subscription.planId), include.plan.include) } : {})
  };
}

function pick(item: any, select: Record<string, boolean> | undefined) {
  if (!item || !select) return item;
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, item[key]]));
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

function findBy(array: any[], key: string, value: string) {
  const item = array.find((entry) => entry[key] === value);
  if (!item) throw new Error(`Missing entity ${value}`);
  return item;
}

function withoutUndefined(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function sameTime(a: Date | string, b: Date | string) {
  return new Date(a).getTime() === new Date(b).getTime();
}
