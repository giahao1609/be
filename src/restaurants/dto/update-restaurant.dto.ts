import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateAddressDto {
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() postalCode?: string;

  @IsOptional() @IsString() locationType?: 'Point';

  @IsOptional() @IsArray() @Type(() => Number)
  coordinates?: number[]; // [lng, lat]

  @IsOptional() @IsString() formatted?: string;
}

class UpdateOpeningPeriodDto {
  @IsOptional() @IsString() opens?: string;
  @IsOptional() @IsString() closes?: string;
}

class UpdateOpeningDayDto {
  @IsOptional() @IsString()
  @IsIn(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])
  day?: string;

  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpdateOpeningPeriodDto)
  periods?: UpdateOpeningPeriodDto[];

  @IsOptional() @IsBoolean() closed?: boolean;
  @IsOptional() @IsBoolean() is24h?: boolean;
}

class UpdateGeoPointDto {
  @IsOptional() @IsString() type?: 'Point';
  @IsOptional() @IsArray() @Type(() => Number)
  coordinates?: number[]; // [lng, lat]
}

export class UpdateRestaurantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() slug?: string;

  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() taxCode?: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() email?: string;

  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsArray() @Type(() => String) gallery?: string[];

  @IsOptional() @ValidateNested() @Type(() => UpdateAddressDto)
  address?: UpdateAddressDto;

  @IsOptional() @ValidateNested() @Type(() => UpdateGeoPointDto)
  location?: UpdateGeoPointDto;

  @IsOptional() @IsArray() @Type(() => String) cuisine?: string[];
  @IsOptional() @IsString() priceRange?: string;
  @IsOptional() @Type(() => Number) rating?: number | null;
  @IsOptional() @IsArray() @Type(() => String) amenities?: string[];

  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpdateOpeningDayDto)
  openingHours?: UpdateOpeningDayDto[];

  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsArray() @Type(() => String) keywords?: string[];
  @IsOptional() @IsArray() @Type(() => String) tags?: string[];
  @IsOptional() @IsArray() @Type(() => String) searchTerms?: string[];

  @IsOptional() extra?: Record<string, any>;
  @IsOptional() @Type(() => Boolean) isActive?: boolean;
}
