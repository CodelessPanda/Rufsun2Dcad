import { Body, Controller, Get, Inject, Param, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/request-user";
import { SaveDocumentDto } from "./dto/save-document.dto";
import { DocumentsService } from "./documents.service";

@Controller("workspaces/:workspaceId/projects/:projectId/document")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get()
  get(@CurrentUser() user: RequestUser, @Param("workspaceId") workspaceId: string, @Param("projectId") projectId: string) {
    return this.documents.get(user.id, workspaceId, projectId);
  }

  @Put()
  save(
    @CurrentUser() user: RequestUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Body() dto: SaveDocumentDto
  ) {
    return this.documents.save(user.id, workspaceId, projectId, dto);
  }
}
