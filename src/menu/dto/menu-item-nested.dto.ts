// menu-item-nested.dto.ts
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { MoneyDto } from './create-menu-item.dto';

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

export class MenuVariantDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  price!: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  compareAtPrice?: MoneyDto;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  isAvailable?: boolean;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  sortIndex?: number;
}

export class MenuOptionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  priceDelta?: MoneyDto;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  })
  tags?: string[];
}

export class MenuOptionGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  minSelect?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  maxSelect?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuOptionDto)
  options?: MenuOptionDto[];
}

export class ItemPromotionDto {
  @IsEnum(['PERCENT', 'FIXED'] as const)
  type!: 'PERCENT' | 'FIXED';

  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  @Min(0)
  value!: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => toNumber(value))
  @Min(1)
  minQty?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  label?: string;
}
