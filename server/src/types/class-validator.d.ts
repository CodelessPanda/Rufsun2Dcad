declare module "class-validator" {
  export function IsEmail(...args: unknown[]): PropertyDecorator;
  export function IsIn(...args: unknown[]): PropertyDecorator;
  export function IsNumber(...args: unknown[]): PropertyDecorator;
  export function IsObject(...args: unknown[]): PropertyDecorator;
  export function IsOptional(...args: unknown[]): PropertyDecorator;
  export function IsString(...args: unknown[]): PropertyDecorator;
  export function IsUrl(...args: unknown[]): PropertyDecorator;
  export function IsUUID(...args: unknown[]): PropertyDecorator;
  export function MinLength(...args: unknown[]): PropertyDecorator;
}
