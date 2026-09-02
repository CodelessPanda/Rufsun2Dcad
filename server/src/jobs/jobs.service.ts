import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AccessControlService } from "../common/access-control.service";
import { Permissions } from "../common/permissions";

@Injectable()
export class JobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService
  ) {}

  async enqueueReport(userId: string, companyId: string, projectId: string) {
    const project = await this.access.requireProject(userId, companyId, projectId);
    await this.access.requireCompanyMembership(userId, companyId, Permissions.REPORT_GENERATE);
    return this.prisma.backgroundJob.create({
      data: {
        tenantId: project.company.tenantId,
        companyId,
        projectId,
        createdById: userId,
        type: "pdf_report",
        status: "queued",
        payload: { projectId, companyId } as Prisma.InputJsonValue
      } as Prisma.BackgroundJobUncheckedCreateInput
    });
  }

  async get(userId: string, companyId: string, jobId: string) {
    await this.access.requireCompanyMembership(userId, companyId, Permissions.PROJECT_VIEW);
    const job = await this.prisma.backgroundJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException("Job not found");
    return job;
  }

  async markProcessing(jobId: string) {
    return this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "processing", attempts: { increment: 1 }, startedAt: new Date(), failedAt: null }
    });
  }

  async markCompleted(jobId: string, result: Prisma.InputJsonValue) {
    return this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "completed", result, completedAt: new Date(), error: null }
    });
  }

  async markFailed(jobId: string, error: string) {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Job not found");
    const retry = job.attempts < job.maxAttempts;
    return this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: retry ? "queued" : "failed",
        error,
        failedAt: retry ? null : new Date()
      }
    });
  }
}
