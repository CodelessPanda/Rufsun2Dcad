import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { JobsService } from "./jobs.service";

@Controller("companies/:companyId")
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post("projects/:projectId/report-jobs")
  enqueueReport(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("projectId") projectId: string) {
    return this.jobs.enqueueReport(user.id, companyId, projectId);
  }

  @Get("jobs/:jobId")
  get(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("jobId") jobId: string) {
    return this.jobs.get(user.id, companyId, jobId);
  }
}
