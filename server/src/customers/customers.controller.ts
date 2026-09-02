import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/request-user";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CustomersService } from "./customers.service";

@Controller(["workspaces/:companyId/customers", "companies/:companyId/customers"])
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Query("search") search?: string) {
    return this.customers.list(user.id, companyId, search);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.id, companyId, dto);
  }

  @Get(":customerId")
  get(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("customerId") customerId: string) {
    return this.customers.get(user.id, companyId, customerId);
  }

  @Patch(":customerId")
  update(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Param("customerId") customerId: string,
    @Body() dto: UpdateCustomerDto
  ) {
    return this.customers.update(user.id, companyId, customerId, dto);
  }

  @Post(":customerId/archive")
  archive(@CurrentUser() user: RequestUser, @Param("companyId") companyId: string, @Param("customerId") customerId: string) {
    return this.customers.archive(user.id, companyId, customerId);
  }
}
