import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { WorkspaceAccessService } from "../common/workspace-access.service";
import type { CreateCustomerDto } from "./dto/create-customer.dto";
import type { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService
  ) {}

  async list(userId: string, workspaceId: string, search = "") {
    await this.access.requireMember(userId, workspaceId);
    const query = search.trim();
    return this.prisma.customer.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        OR: query
          ? [
              { name: { contains: query, mode: "insensitive" } },
              { companyName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } }
            ]
          : undefined
      },
      include: { _count: { select: { projects: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async create(userId: string, workspaceId: string, dto: CreateCustomerDto) {
    await this.access.requireMember(userId, workspaceId, ["owner", "admin", "designer", "sales"]);
    return this.prisma.customer.create({
      data: {
        workspaceId,
        createdById: userId,
        customerType: dto.customerType ?? "individual",
        name: dto.name.trim(),
        companyName: clean(dto.companyName),
        email: clean(dto.email),
        phone: clean(dto.phone),
        alternatePhone: clean(dto.alternatePhone),
        address: clean(dto.address),
        addressLine2: clean(dto.addressLine2),
        city: clean(dto.city),
        state: clean(dto.state),
        postalCode: clean(dto.postalCode),
        country: clean(dto.country),
        latitude: dto.latitude,
        longitude: dto.longitude,
        placeId: clean(dto.placeId),
        notes: clean(dto.notes)
      }
    });
  }

  async get(userId: string, workspaceId: string, customerId: string) {
    await this.access.requireCustomer(userId, workspaceId, customerId);
    return this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, workspaceId, archivedAt: null },
      include: {
        projects: {
          where: { archivedAt: null },
          orderBy: { updatedAt: "desc" },
          include: { document: { select: { updatedAt: true, schemaVersion: true } } }
        }
      }
    });
  }

  async update(userId: string, workspaceId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.access.requireCustomer(userId, workspaceId, customerId);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        customerType: dto.customerType,
        name: dto.name?.trim(),
        companyName: maybe(dto.companyName),
        email: maybe(dto.email),
        phone: maybe(dto.phone),
        alternatePhone: maybe(dto.alternatePhone),
        address: maybe(dto.address),
        addressLine2: maybe(dto.addressLine2),
        city: maybe(dto.city),
        state: maybe(dto.state),
        postalCode: maybe(dto.postalCode),
        country: maybe(dto.country),
        latitude: dto.latitude,
        longitude: dto.longitude,
        placeId: maybe(dto.placeId),
        notes: maybe(dto.notes)
      }
    });
  }

  async archive(userId: string, workspaceId: string, customerId: string) {
    await this.access.requireCustomer(userId, workspaceId, customerId);
    return this.prisma.customer.update({ where: { id: customerId }, data: { archivedAt: new Date() } });
  }
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

function maybe(value: string | undefined) {
  return value === undefined ? undefined : clean(value);
}
