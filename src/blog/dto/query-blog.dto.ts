// src/blog/dto/query-blog.dto.ts
import { IsInt, IsOptional, IsString } from 'class-validator';

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
