// src/restaurants/dto/create-restaurant.dto.ts
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRestaurantDto {
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  // mấy field dưới để any, service sẽ tự parse JSON/string
  @IsOptional()
  gallery?: any;

  @IsOptional()
  address?: any;

  @IsOptional()
  location?: any;

  @IsOptional()
  cuisine?: any;

  @IsOptional()
  amenities?: any;

  @IsOptional()
  openingHours?: any;

  @IsOptional()
  @IsString()
  priceRange?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'rating must be a number' })
  rating?: number | null;

  @IsOptional()
  keywords?: any;

  @IsOptional()
  tags?: any;

  @IsOptional()
  searchTerms?: any;

  @IsOptional()
  extra?: any;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
