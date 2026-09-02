import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { CompaniesController } from "./companies/companies.controller";
import { CustomersController } from "./customers/customers.controller";
import { CustomersService } from "./customers/customers.service";
import { DocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { PrismaService } from "./prisma.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { SolarController } from "./solar/solar.controller";
import { SolarService } from "./solar/solar.service";
import { AccessControlService } from "./common/access-control.service";
import { EmailService } from "./common/email.service";
import { LicenseCapabilityService } from "./common/license-capability.service";
import { PermissionService } from "./common/permission.service";
import { CommercialController } from "./commercial/commercial.controller";
import { CommercialService } from "./commercial/commercial.service";
import { InvitationsController } from "./invitations/invitations.controller";
import { InvitationsService } from "./invitations/invitations.service";
import { MembersService } from "./members/members.service";
import { AdminTenantsController } from "./tenants/admin-tenants.controller";
import { TenantsController } from "./tenants/tenants.controller";
import { TenantsService } from "./tenants/tenants.service";
import { WorkspacesController } from "./workspaces/workspaces.controller";
import { WorkspacesService } from "./workspaces/workspaces.service";

@Module({
  controllers: [
    AuthController,
    AdminTenantsController,
    TenantsController,
    CompaniesController,
    WorkspacesController,
    CustomersController,
    ProjectsController,
    DocumentsController,
    SolarController,
    InvitationsController,
    CommercialController
  ],
  providers: [
    PrismaService,
    AuthService,
    EmailService,
    PermissionService,
    LicenseCapabilityService,
    CommercialService,
    AccessControlService,
    InvitationsService,
    MembersService,
    TenantsService,
    WorkspacesService,
    CustomersService,
    ProjectsService,
    DocumentsService,
    SolarService
  ]
})
export class AppModule {}
