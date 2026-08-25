import { IsObject, IsOptional, IsString } from "class-validator";

export class SaveDocumentDto {
  @IsObject()
  documentJson!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  schemaVersion?: string;
}
