// src/users/dto/query-users.dto.ts
import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { RoleEnum } from '../schema/user.schema';

export class QueryUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  // Tìm kiếm chung theo tên / email / phone / username
  @IsOptional()
  @IsString()
  q?: string;

  // lọc theo role
  @IsOptional()
  @IsString()
  @IsIn(RoleEnum as readonly string[])
  role?: any;

  // lọc theo active
  @IsOptional()
  @IsString()
  isActive?: 'true' | 'false';
}
