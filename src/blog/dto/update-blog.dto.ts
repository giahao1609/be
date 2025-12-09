// src/blog/dto/update-blog.dto.ts
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateBlogDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  excerpt?: string;

  @IsString()
  @IsOptional()
  contentHtml?: string;

  @IsOptional()
  contentJson?: any;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @IsInt()
  @Min(1)
  @IsOptional()
  readingMinutes?: number;

  @IsEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const)
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  metaTitle?: string;

  @IsString()
  @IsOptional()
  metaDescription?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  // cho phép FE set heroImageUrl / gallery path sẵn (khi dùng UploadService riêng)
  @IsString()
  @IsOptional()
  heroImageUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  gallery?: string[];
}
export class UpdateBlogHiddenDto {
  @IsBoolean()
  isHidden!: boolean;
}