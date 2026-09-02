import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { readServerEnvironment } from "../common/env";

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  async ready() {
    try {
      await this.prisma.$connect();
      const env = readServerEnvironment();
      return {
        status: "ok",
        dependencies: {
          database: "ok",
          redis: env.redisUrl ? "configured" : "optional",
          storage: env.storageDriver
        },
        timestamp: new Date().toISOString()
      };
    } catch {
      return {
        status: "degraded",
        dependencies: { database: "unavailable" },
        timestamp: new Date().toISOString()
      };
    }
  }
}
