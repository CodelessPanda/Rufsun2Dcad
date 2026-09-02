import { IsEmail, IsIn, IsOptional } from "class-validator";
import { SeatType, TenantRole, WorkspaceMemberRole, WorkspaceMemberStatus } from "@prisma/client";

const COMPANY_ROLES: WorkspaceMemberRole[] = ["company_owner", "company_admin", "design_manager", "designer", "sales_manager", "sales_rep", "project_viewer", "owner", "admin", "sales", "viewer"];
const TENANT_ROLES: TenantRole[] = ["owner", "admin", "billing", "support", "member"];
const SEAT_TYPES: SeatType[] = ["designer", "sales", "viewer", "no_seat"];
const MEMBER_STATUSES: WorkspaceMemberStatus[] = ["active", "invited", "suspended", "removed", "disabled"];

export class CreateCompanyInvitationDto {
  @IsEmail()
  email!: string;

  @IsIn(COMPANY_ROLES)
  role!: WorkspaceMemberRole;

  @IsOptional()
  @IsIn(SEAT_TYPES)
  seatType?: SeatType;
}

export class CreateTenantInvitationDto {
  @IsEmail()
  email!: string;

  @IsIn(TENANT_ROLES)
  role!: TenantRole;
}

export class UpdateCompanyMemberDto {
  @IsOptional()
  @IsIn(COMPANY_ROLES)
  role?: WorkspaceMemberRole;

  @IsOptional()
  @IsIn(SEAT_TYPES)
  seatType?: SeatType;

  @IsOptional()
  @IsIn(MEMBER_STATUSES)
  status?: WorkspaceMemberStatus;
}

export class UpdateTenantMemberDto {
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: TenantRole;

  @IsOptional()
  @IsIn(MEMBER_STATUSES)
  status?: WorkspaceMemberStatus;
}
