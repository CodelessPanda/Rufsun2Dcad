import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { ProductCapability } from "./permissions";
import { hasCapability, seatCapabilities } from "./permissions";
import { PrismaService } from "../prisma.service";

@Injectable()
export class LicenseCapabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async hasSeatCapability(userId: string, companyId: string, capability: ProductCapability) {
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, status: "active", company: { status: "active", tenant: { status: "active" } } }
    });
    return membership ? hasCapability(seatCapabilities(membership.seatType), capability) : false;
  }

  async requireSeatCapability(userId: string, companyId: string, capability: ProductCapability) {
    if (!(await this.hasSeatCapability(userId, companyId, capability))) {
      throw new ForbiddenException("Your account does not include the product capability required for this action.");
    }
  }

  async capabilitiesForCompany(userId: string, companyId: string) {
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, status: "active", company: { status: "active", tenant: { status: "active" } } }
    });
    return membership ? seatCapabilities(membership.seatType) : [];
  }
}
