import {
  IsArray, IsBoolean, IsInt, IsMongoId, IsOptional, IsString, Min
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types'; // ⬅️ thêm import này

export class CreateCategoryDto {
  @IsString() name!: string;             // create: required
  @IsString() @IsOptional() slug?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() image?: string;

  @IsMongoId() @IsOptional() parentId?: string | null;

  @IsBoolean() @IsOptional() isActive?: boolean = true;
  @IsInt() @Min(0) @IsOptional() sortIndex?: number = 0;

  @IsOptional() extra?: Record<string, any>;
}

// ⬇️ biến mọi field của CreateCategoryDto thành optional cho update
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ListCategoriesQueryDto {
  @IsMongoId() restaurantId!: string;
  @IsString() @IsOptional() q?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsOptional() parentId?: string | null;
  @IsInt() @Min(1) @IsOptional() page?: number = 1;
  @IsInt() @Min(1) @IsOptional() limit?: number = 50;
  @IsString() @IsOptional() sort?: string = 'sortIndex:asc,createdAt:desc';
}

export class ReorderDto {
  items!: { id: string; sortIndex: number }[];
}

export class MoveCategoryDto {
  @IsOptional() newParentId?: string | null;
}
