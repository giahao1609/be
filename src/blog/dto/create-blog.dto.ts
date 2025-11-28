// src/blog/dto/create-blog.dto.ts
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { BlogStatus } from '../schema/blog.schema';

export class CreateBlogDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

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
}
