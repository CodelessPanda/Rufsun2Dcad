import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(["direct", "distributor", "enterprise"])
  type?: "direct" | "distributor" | "enterprise";

  @IsOptional()
  @IsIn(["active", "suspended", "archived"])
  status?: "active" | "suspended" | "archived";
}
