import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/request-user";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { ProjectsService } from "./projects.service";

@Controller("workspaces/:workspaceId/projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string) {
    return this.projects.list(user.id, workspaceId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, workspaceId, dto);
  }

  @Get(":projectId")
  get(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string, @Param("projectId") projectId: string) {
    return this.projects.get(user.id, workspaceId, projectId);
  }

  @Patch(":projectId")
  update(
    @CurrentUser() user: RequestUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.projects.update(user.id, workspaceId, projectId, dto);
  }

  @Post(":projectId/archive")
  archive(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string, @Param("projectId") projectId: string) {
    return this.projects.archive(user.id, workspaceId, projectId);
  }
}
