import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";
import { CommercialService } from "../commercial/commercial.service";
import { Entitlements } from "../commercial/commercial.constants";
import type { CreateProjectDto } from "./dto/create-project.dto";
import type { UpdateProjectDto } from "./dto/update-project.dto";
import { validateCadDocument } from "../documents/cad-document.validator";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async list(userId: string, companyId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    return this.prisma.project.findMany({
      where: { companyId, archivedAt: null },
      include: {
        customer: { select: { id: true, name: true, companyName: true, phone: true, email: true } },
        document: { select: { updatedAt: true, schemaVersion: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(userId: string, companyId: string, dto: CreateProjectDto) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_CREATE);
    await this.ensureProjectLimit(companyId);
    const customer = await this.access.requireCustomer(userId, companyId, dto.customerId);
    if (customer.companyId !== companyId) throw new BadRequestException("The customer does not belong to this company.");
    const documentJson = validateCadDocument(dto.documentJson ?? minimalDocument(dto.name, customer.name, dto.address), dto.schemaVersion ?? "1");
    const summary = summarizeDocument(documentJson);
    return this.prisma.project.create({
      data: {
        companyId,
        customerId: customer.id,
        name: dto.name.trim(),
        description: clean(dto.description),
        address: clean(dto.address),
        addressLine2: clean(dto.addressLine2),
        city: clean(dto.city),
        state: clean(dto.state),
        postalCode: clean(dto.postalCode),
        country: clean(dto.country),
        latitude: dto.latitude,
        longitude: dto.longitude,
        placeId: clean(dto.placeId),
        status: dto.status ?? "draft",
        createdById: userId,
        updatedById: userId,
        systemSizeKw: summary.systemSizeKw,
        panelCount: summary.panelCount,
        document: {
          create: {
            companyId,
            documentJson: documentJson as Prisma.InputJsonValue,
            schemaVersion: dto.schemaVersion ?? "1"
          }
        }
      },
      include: { customer: true, document: true }
    });
  }

  async get(userId: string, companyId: string, projectId: string) {
    await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, archivedAt: null },
      include: { customer: true, document: { select: { updatedAt: true, schemaVersion: true } } }
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(userId: string, companyId: string, projectId: string, dto: UpdateProjectDto) {
    await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_UPDATE);
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name?.trim(),
        description: maybe(dto.description),
        address: maybe(dto.address),
        addressLine2: maybe(dto.addressLine2),
        city: maybe(dto.city),
        state: maybe(dto.state),
        postalCode: maybe(dto.postalCode),
        country: maybe(dto.country),
        latitude: dto.latitude,
        longitude: dto.longitude,
        placeId: maybe(dto.placeId),
        status: dto.status,
        updatedById: userId
      },
      include: { customer: true, document: true }
    });
  }

  async archive(userId: string, companyId: string, projectId: string) {
    await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_ARCHIVE);
    return this.prisma.project.update({ where: { id: projectId }, data: { archivedAt: new Date(), status: "archived", updatedById: userId } });
  }

  private async ensureProjectLimit(companyId: string) {
    const limit = await this.commercial.getCompanyLimit(companyId, Entitlements.PROJECTS_MAX);
    if (typeof limit !== "number") return;
    const projects = await this.prisma.project.count({ where: { companyId, archivedAt: null } });
    if (projects >= limit) throw new ForbiddenException("This company has reached its project allowance.");
  }
}

export function summarizeDocument(documentJson: unknown) {
  const objects = typeof documentJson === "object" && documentJson && "objects" in documentJson ? (documentJson as { objects?: unknown[] }).objects : [];
  const panels = Array.isArray(objects) ? objects.filter((object) => isPanel(object)) : [];
  const watts = panels.reduce((sum, panel) => sum + (typeof panel.wattage === "number" ? panel.wattage : 0), 0);
  return {
    panelCount: panels.length,
    systemSizeKw: Math.round((watts / 1000) * 1000) / 1000
  };
}

function isPanel(object: unknown): object is { type: string; wattage?: number } {
  return typeof object === "object" && object !== null && (object as { type?: string }).type === "solarPanel";
}

function minimalDocument(name: string, customerName: string, address?: string) {
  const now = new Date().toISOString();
  return {
    rufsunCadVersion: "0.2",
    version: "1.0.0",
    name,
    customerName,
    customerAddress: address ?? "",
    solarRegistration: {
      eastOffsetMeters: 0,
      northOffsetMeters: 0,
      rotationDegrees: 0,
      scale: 1,
      calibrated: false
    },
    units: "mm",
    objects: [],
    layers: [],
    settings: { grid: { visible: true, minor: 304.8, major: 1524 }, snap: {}, activeLayerId: "roof" },
    createdAt: now,
    updatedAt: now
  };
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

function maybe(value: string | undefined) {
  return value === undefined ? undefined : clean(value);
}
