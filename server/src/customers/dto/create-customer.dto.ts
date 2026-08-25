import { IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerDto {
  @IsOptional()
  @IsIn(["individual", "business"])
  customerType?: "individual" | "business";

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
