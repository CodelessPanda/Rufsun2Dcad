import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { CompaniesController } from "./companies/companies.controller";
import { CustomersController } from "./customers/customers.controller";
import { CustomersService } from "./customers/customers.service";
import { DocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { JobsController } from "./jobs/jobs.controller";
import { JobsService } from "./jobs/jobs.service";
import { PrismaService } from "./prisma.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { SolarController } from "./solar/solar.controller";
import { SolarService } from "./solar/solar.service";
import { StorageController } from "./storage/storage.controller";
import { StorageService } from "./storage/storage.service";
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
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { CacheService } from "./common/cache.service";
import { ErrorMonitorService } from "./common/error-monitor.service";
import { RateLimitMiddleware } from "./common/rate-limit.middleware";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { RequestLoggingMiddleware } from "./common/request-logging.middleware";
import { StructuredLogger } from "./common/structured-logger.service";

@Module({
  controllers: [
    AuthController,
    AdminController,
    AdminTenantsController,
    TenantsController,
    CompaniesController,
    WorkspacesController,
    CustomersController,
    ProjectsController,
    DocumentsController,
    SolarController,
    StorageController,
    JobsController,
    HealthController,
    InvitationsController,
    CommercialController
  ],
  providers: [
    PrismaService,
    AdminService,
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
    SolarService,
    StorageService,
    JobsService,
    HealthService,
    StructuredLogger,
    CacheService,
    ErrorMonitorService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, RateLimitMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}
