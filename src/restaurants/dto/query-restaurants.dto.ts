import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class QueryRestaurantsDto {
  @IsOptional() @IsString() q?: string;

  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() country?: string;

  @IsOptional() @IsString() tags?: string; // comma-separated
  @IsOptional() @IsString() cuisine?: string; // comma-separated

  @IsOptional() @IsMongoId() ownerId?: string;
  @IsOptional() @IsMongoId() categoryId?: string;

  @IsOptional() @IsBooleanString() isActive?: string; // 'true'|'false'

  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() radius?: number; // meters

  /** createdAt, -createdAt, rating, -rating, name, -name, distance (requires lat/lng) */
  @IsOptional() @IsString() sort?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit: number = 20;
}

export class OwnerRestaurantsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit: number = 20;
}
