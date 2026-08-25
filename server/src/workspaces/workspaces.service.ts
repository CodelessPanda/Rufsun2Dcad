import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, WorkspaceMemberRole } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WorkspaceAccessService } from "../common/workspace-access.service";
import type { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import type { UpdateWorkspaceDto } from "./dto/update-workspace.dto";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService
  ) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, status: "active", workspace: { status: "active" } },
      include: { workspace: true },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role
    }));
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const slug = await this.uniqueSlug(dto.name);
    return this.prisma.workspace.create({
      data: {
        name: dto.name.trim(),
        slug,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        website: dto.website?.trim() || null,
        createdById: userId,
        members: {
          create: {
            userId,
            role: "owner",
            status: "active",
            joinedAt: new Date()
          }
        }
      },
      include: { members: true }
    });
  }

  async get(userId: string, workspaceId: string) {
    await this.access.requireMember(userId, workspaceId);
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, status: "active" } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  async update(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.access.requireMember(userId, workspaceId, ["owner", "admin"]);
    const data: Prisma.WorkspaceUpdateInput = {
      name: dto.name?.trim(),
      logoUrl: dto.logoUrl?.trim() || undefined,
      email: dto.email?.trim() || undefined,
      phone: dto.phone?.trim() || undefined,
      website: dto.website?.trim() || undefined,
      address: dto.address?.trim() || undefined,
      city: dto.city?.trim() || undefined,
      state: dto.state?.trim() || undefined,
      postalCode: dto.postalCode?.trim() || undefined,
      country: dto.country?.trim() || undefined
    };
    if (dto.name) data.slug = await this.uniqueSlug(dto.name, workspaceId);
    return this.prisma.workspace.update({ where: { id: workspaceId }, data });
  }

  async members(userId: string, workspaceId: string) {
    await this.access.requireMember(userId, workspaceId);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });
  }

  async summary(userId: string, workspaceId: string) {
    await this.access.requireMember(userId, workspaceId);
    const [customers, projects, activeProjects, capacity] = await Promise.all([
      this.prisma.customer.count({ where: { workspaceId, archivedAt: null } }),
      this.prisma.project.count({ where: { workspaceId, archivedAt: null } }),
      this.prisma.project.count({ where: { workspaceId, archivedAt: null, status: "active" } }),
      this.prisma.project.aggregate({
        where: { workspaceId, archivedAt: null },
        _sum: { systemSizeKw: true }
      })
    ]);
    return {
      customers,
      projects,
      activeProjects,
      totalDesignedCapacityKw: capacity._sum.systemSizeKw ?? 0
    };
  }

  private async uniqueSlug(name: string, excludeWorkspaceId?: string) {
    const base = slugify(name).slice(0, 42) || "workspace";
    let slug = base;
    let counter = 2;
    while (
      await this.prisma.workspace.findFirst({
        where: { slug, id: excludeWorkspaceId ? { not: excludeWorkspaceId } : undefined }
      })
    ) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
