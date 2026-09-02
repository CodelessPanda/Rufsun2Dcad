import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/request-user";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { ProjectsService } from "./projects.service";

@Controller(["workspaces/:companyId/projects", "companies/:companyId/projects"])
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string) {
    return this.projects.list(user.id, companyId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, companyId, dto);
  }

  @Get(":projectId")
  get(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("projectId") projectId: string) {
    return this.projects.get(user.id, companyId, projectId);
  }

  @Patch(":projectId")
  update(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Param("projectId") projectId: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.projects.update(user.id, companyId, projectId, dto);
  }

  @Post(":projectId/archive")
  archive(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("projectId") projectId: string) {
    return this.projects.archive(user.id, companyId, projectId);
  }
}
