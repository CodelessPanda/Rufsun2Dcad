import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/request-user";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto);
  }

  @Get(":workspaceId")
  get(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.get(user.id, workspaceId);
  }

  @Patch(":workspaceId")
  update(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(user.id, workspaceId, dto);
  }

  @Get(":workspaceId/members")
  members(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.members(user.id, workspaceId);
  }

  @Get(":workspaceId/summary")
  summary(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspaces.summary(user.id, workspaceId);
  }
}
