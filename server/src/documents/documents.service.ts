import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WorkspaceAccessService } from "../common/workspace-access.service";
import type { SaveDocumentDto } from "./dto/save-document.dto";
import { summarizeDocument } from "../projects/projects.service";

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService
  ) {}

  async get(userId: string, workspaceId: string, projectId: string) {
    await this.access.requireProject(userId, workspaceId, projectId);
    const document = await this.prisma.projectDocument.findFirst({ where: { workspaceId, projectId } });
    if (!document) throw new NotFoundException("Project document not found");
    return document;
  }

  async save(userId: string, workspaceId: string, projectId: string, dto: SaveDocumentDto) {
    await this.access.requireProject(userId, workspaceId, projectId);
    const summary = summarizeDocument(dto.documentJson);
    const [document] = await this.prisma.$transaction([
      this.prisma.projectDocument.upsert({
        where: { projectId },
        create: {
          workspaceId,
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
