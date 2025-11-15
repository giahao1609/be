// src/menu-items/dto/create-menu-item.dto.ts
import {
  IsArray, IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString,
  Min, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

class MoneyDto {
  @IsOptional() @IsString() currency?: string; // default VND
  @IsNumber() @Min(0) amount!: number;
}

class MenuVariantDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() label?: string;
  @ValidateNested() @Type(() => MoneyDto) price!: MoneyDto;
  @IsOptional() @ValidateNested() @Type(() => MoneyDto) compareAtPrice?: MoneyDto;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsNumber() sortIndex?: number;
}

class MenuOptionDto {
  @IsString() name!: string;
  @IsOptional() @ValidateNested() @Type(() => MoneyDto) priceDelta?: MoneyDto;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

class MenuOptionGroupDto {
  @IsString() name!: string;
  @IsOptional() @IsNumber() minSelect?: number;
  @IsOptional() @IsNumber() maxSelect?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => MenuOptionDto) options?: MenuOptionDto[];
}

class ItemPromotionDto {
  @IsEnum(['PERCENT','FIXED'] as const) type!: 'PERCENT' | 'FIXED';
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsNumber() @Min(1) minQty?: number;
  @IsOptional() @Type(() => Date) startAt?: Date;
  @IsOptional() @Type(() => Date) endAt?: Date;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() label?: string;
}

export class CreateMenuItemDto {
  @IsMongoId() restaurantId!: string;
  @IsOptional() @IsMongoId() categoryId?: string;

  @IsString() name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;

  // nếu FE upload trực tiếp lên GCS rồi chỉ gửi object names:
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) cuisines?: string[];

  @IsOptional() @IsEnum(['food','drink','dessert','other'] as const) itemType?: 'food' | 'drink' | 'dessert' | 'other';

  @ValidateNested() @Type(() => MoneyDto) basePrice!: MoneyDto;
  @IsOptional() @ValidateNested() @Type(() => MoneyDto) compareAtPrice?: MoneyDto;

  @IsOptional() @ValidateNested({ each: true }) @Type(() => MenuVariantDto) variants?: MenuVariantDto[];
  @IsOptional() @ValidateNested({ each: true }) @Type(() => MenuOptionGroupDto) optionGroups?: MenuOptionGroupDto[];
  @IsOptional() @ValidateNested({ each: true }) @Type(() => ItemPromotionDto) promotions?: ItemPromotionDto[];

  @IsOptional() @IsBoolean() vegetarian?: boolean;
  @IsOptional() @IsBoolean() vegan?: boolean;
  @IsOptional() @IsBoolean() halal?: boolean;
  @IsOptional() @IsBoolean() glutenFree?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) allergens?: string[];
  @IsOptional() @IsNumber() @Min(0) spicyLevel?: number;

  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsNumber() sortIndex?: number;

  // extra: bất kỳ
}
