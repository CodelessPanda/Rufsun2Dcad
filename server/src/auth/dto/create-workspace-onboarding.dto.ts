import { IsString, MinLength } from "class-validator";

export class CreateWorkspaceOnboardingDto {
  @IsString()
  @MinLength(2)
  workspaceName!: string;
}
