import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { CustomersController } from "./customers/customers.controller";
import { CustomersService } from "./customers/customers.service";
import { DocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { PrismaService } from "./prisma.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { SolarController } from "./solar/solar.controller";
import { SolarService } from "./solar/solar.service";
import { WorkspaceAccessService } from "./common/workspace-access.service";
import { WorkspacesController } from "./workspaces/workspaces.controller";
import { WorkspacesService } from "./workspaces/workspaces.service";

@Module({
  controllers: [AuthController, WorkspacesController, CustomersController, ProjectsController, DocumentsController, SolarController],
  providers: [PrismaService, AuthService, WorkspaceAccessService, WorkspacesService, CustomersService, ProjectsService, DocumentsService, SolarService]
})
export class AppModule {}
