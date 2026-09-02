import { Controller, Get, HttpCode, Inject } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  live() {
    return this.health.live();
  }

  @Get("ready")
  @HttpCode(200)
  ready() {
    return this.health.ready();
  }
}
