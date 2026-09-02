import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { LicenseCapabilityService } from "../common/license-capability.service";
import { Permissions, ProductCapabilities } from "../common/permissions";
import { CommercialService } from "../commercial/commercial.service";
import { Entitlements } from "../commercial/commercial.constants";
import type { SaveDocumentDto } from "./dto/save-document.dto";
import { summarizeDocument } from "../projects/projects.service";

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService,
    @Inject(LicenseCapabilityService) private readonly licenses: LicenseCapabilityService,
    @Inject(CommercialService) private readonly commercial: CommercialService
  ) {}

  async get(userId: string, companyId: string, projectId: string) {
    await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.DESIGN_VIEW);
    await this.commercial.requireCompanyEntitlement(companyId, Entitlements.CAD_ACCESS);
    const document = await this.prisma.projectDocument.findFirst({ where: { companyId, projectId } });
    if (!document) throw new NotFoundException("Project document not found");
    return document;
  }

  async save(userId: string, companyId: string, projectId: string, dto: SaveDocumentDto) {
    await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.DESIGN_EDIT);
    await this.commercial.requireCompanyEntitlement(companyId, Entitlements.CAD_EDIT);
    await this.licenses.requireSeatCapability(userId, companyId, ProductCapabilities.CAD_EDIT);
    const summary = summarizeDocument(dto.documentJson);
    const [document] = await this.prisma.$transaction([
      this.prisma.projectDocument.upsert({
        where: { projectId },
        create: {
          companyId,
          projectId,
          documentJson: dto.documentJson as Prisma.InputJsonValue,
          schemaVersion: dto.schemaVersion ?? "1"
        },
        update: {
          documentJson: dto.documentJson as Prisma.InputJsonValue,
          schemaVersion: dto.schemaVersion ?? "1"
        }
      }),
      this.prisma.project.update({
        where: { id: projectId },
        data: { panelCount: summary.panelCount, systemSizeKw: summary.systemSizeKw, updatedById: userId }
      })
    ]);
    return document;
  }
}
