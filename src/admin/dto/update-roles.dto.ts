import { IsArray, ArrayNotEmpty, IsIn, IsEnum } from 'class-validator';

export const ALLOWED_ROLES = ['customer', 'admin', 'owner'] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export class UpdateRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(['customer', 'admin', 'owner'], { each: true })
  roles!: ('customer' | 'admin' | 'owner')[];
}