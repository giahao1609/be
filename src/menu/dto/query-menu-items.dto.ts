// src/menu-items/dto/query-menu-items.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsBooleanString, IsEnum, IsInt, IsMongoId, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

export class QueryMenuItemsDto {
  @IsOptional() @IsString() q?: string;

  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsString() tags?: string;     // comma-separated
  @IsOptional() @IsString() cuisines?: string; // comma-separated
  @IsOptional() @IsEnum(['food','drink','dessert','other'] as const) itemType?: 'food'|'drink'|'dessert'|'other';
  @IsOptional() @IsBooleanString() isAvailable?: string; // 'true'|'false'

  /** createdAt | -createdAt | name | -name | rating | -rating | price | -price | sortIndex | -sortIndex */
  @IsOptional() @IsString() sort?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit: number = 20;
}


export class QueryTopDiscountedDto {
  @IsOptional()
  @IsNumberString()
  page?: string;   // default 1

  @IsOptional()
  @IsNumberString()
  limit?: string;  // default 20
}

export class QueryFeaturedRestaurantsDto {
  @IsOptional()
  @IsNumberString()
  page?: string;   // default 1

  @IsOptional()
  @IsNumberString()
  limit?: string;  // default 12

  // Khoảng giá (VND)
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  // Quận/Huyện...
  @IsOptional()
  @IsString()
  district?: string;

  // Món ăn (phở, sushi...)
  @IsOptional()
  @IsString()
  q?: string;
}