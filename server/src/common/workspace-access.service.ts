import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Permission } from "./permissions";
import { Permissions } from "./permissions";
import { AccessControlService } from "./access-control.service";
import { PrismaService } from "../prisma.service";

/**
 * Compatibility service for older workspace-named code paths.
 * Phase 2 models workspaces as Companies while preserving the existing DB table.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessControlService) private readonly access: AccessControlService
  ) {}

  async requireMember(userId: string, workspaceId: string, permission: Permission = Permissions.COMPANY_VIEW) {
    return this.access.requireCompanyMembership(userId, workspaceId, permission).catch((error) => {
      if (error instanceof ForbiddenException) throw new ForbiddenException("Company access denied");
      throw error;
    });
  }

  async requireCustomer(userId: string, workspaceId: string, customerId: string) {
    await this.requireMember(userId, workspaceId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: workspaceId, archivedAt: null }
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async requireProject(userId: string, workspaceId: string, projectId: string) {
    await this.requireMember(userId, workspaceId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: workspaceId, archivedAt: null },
      include: { customer: true }
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
