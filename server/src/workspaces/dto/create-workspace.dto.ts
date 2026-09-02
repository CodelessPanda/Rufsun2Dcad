import { IsEmail, IsOptional, IsString, IsUrl, MinLength } from "class-validator";

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEmail()
  primaryAdminEmail?: string;

  @IsOptional()
  designerAllocation?: number;

  @IsOptional()
  salesAllocation?: number;
}
