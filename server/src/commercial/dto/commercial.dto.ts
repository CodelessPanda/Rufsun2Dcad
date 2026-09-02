import { IsIn, IsOptional, IsString } from "class-validator";
import type { BillingMode, PlanCode, SeatType, SubscriptionStatus } from "@prisma/client";

const PLAN_CODES: PlanCode[] = ["starter", "professional", "business", "enterprise", "distributor", "internal"];
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["trialing", "active", "grace_period", "suspended", "canceled", "expired"];
const BILLING_MODES: BillingMode[] = ["manual", "external"];
const ALLOCATION_SEATS: SeatType[] = ["designer", "sales", "viewer"];

export class UpsertTenantSubscriptionDto {
  @IsIn(PLAN_CODES)
  planCode!: PlanCode;

  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsIn(BILLING_MODES)
  billingMode?: BillingMode;

  @IsOptional()
  @IsString()
  trialStartsAt?: string;

  @IsOptional()
  @IsString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  graceEndsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSeatCapacityDto {
  @IsIn(ALLOCATION_SEATS)
  seatType!: SeatType;

  @IsOptional()
  total?: number;

  @IsOptional()
  unlimited?: boolean;
}

export class UpdateCompanyAllocationDto {
  @IsIn(ALLOCATION_SEATS)
  seatType!: SeatType;

  @IsOptional()
  allocated?: number;

  @IsOptional()
  unlimited?: boolean;
}
