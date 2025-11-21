// src/menu-items/dto/create-menu-item.dto.ts
import {
  IsArray, IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString,
  Min, ValidateNested
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MoneyDto {
  @IsString()
  @IsOptional()
  currency?: string;

  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  })
  @IsNumber()
  @Min(0)
  amount!: number;
}


import {
  ItemPromotionDto,
  MenuOptionGroupDto,
  MenuVariantDto,
} from './menu-item-nested.dto';

const toBool = (value: any) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
  }
  return value;
};

const toNumber = (value: any) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
};

const toStringArray = (value: any) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

export class CreateMenuItemDto {
  // body có thể không gửi; param dùng để đảm bảo, nên để Optional
  @IsOptional()
  @IsMongoId()
  restaurantId?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // nếu FE upload trực tiếp lên GCS rồi chỉ gửi object names:
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => toStringArray(value))
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => toStringArray(value))
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => toStringArray(value))
  cuisines?: string[];

  @IsOptional()
  @IsEnum(['food', 'drink', 'dessert', 'other'] as const)
  itemType?: 'food' | 'drink' | 'dessert' | 'other';

  @ValidateNested()
  @Type(() => MoneyDto)
  basePrice!: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  compareAtPrice?: MoneyDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MenuVariantDto)
  variants?: MenuVariantDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MenuOptionGroupDto)
  optionGroups?: MenuOptionGroupDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ItemPromotionDto)
  promotions?: ItemPromotionDto[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  vegetarian?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  vegan?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  halal?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  glutenFree?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => toStringArray(value))
  allergens?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toNumber(value))
  spicyLevel?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  isAvailable?: boolean;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  sortIndex?: number;

  // extra: bất kỳ
  @IsOptional()
  extra?: Record<string, any>;
}
