// src/blog/dto/query-blog.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryBlogsDto {
  @IsInt()
  @IsOptional()
  page?: number;

  @IsInt()
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  q?: string; // full-text search

  @IsString()
  @IsOptional()
  tags?: string; // "tag1,tag2"

  @IsString()
  @IsOptional()
  categories?: string; // "blog,review..."

  @IsString()
  @IsOptional()
  authorId?: string;

  @IsString()
  @IsOptional()
  status?: string; // public: default = "PUBLISHED"
}


export class QueryBlogsAllDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}