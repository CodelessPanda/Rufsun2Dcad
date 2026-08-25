import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { WorkspaceMemberRole } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class WorkspaceAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireMember(userId: string, workspaceId: string, roles?: WorkspaceMemberRole[]) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId,
        workspaceId,
        status: "active",
        workspace: { status: "active" }
      }
    });
    if (!membership) throw new ForbiddenException("Workspace access denied");
    if (roles?.length && !roles.includes(membership.role)) {
      throw new ForbiddenException("Workspace role does not allow this action");
    }
    return membership;
  }

  async requireCustomer(userId: string, workspaceId: string, customerId: string) {
    await this.requireMember(userId, workspaceId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, workspaceId, archivedAt: null }
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async requireProject(userId: string, workspaceId: string, projectId: string) {
    await this.requireMember(userId, workspaceId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId, archivedAt: null },
      include: { customer: true }
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
