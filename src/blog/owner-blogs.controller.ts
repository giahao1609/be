// src/blog/owner-blogs.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { BlogsService } from './blogs.service';
import type { UploadFiles } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { QueryBlogsDto } from './dto/query-blog.dto';
import { BusinessExceptionFilter } from 'src/filters/business-exception.filter';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@Controller('blogs')
@UseFilters(BusinessExceptionFilter)
@UseGuards(JwtAuthGuard, RolesGuard)
export class OwnerBlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'hero', maxCount: 1 },      
        { name: 'gallery', maxCount: 16 },  
      ],
      { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  async create(
    @Body() body: CreateBlogDto & Record<string, any>,
    @CurrentUser() currentUser: any,
    @UploadedFiles() files?: UploadFiles,
  ) {
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }

    return this.blogsService.createForAuthor(currentUser._id, body, files);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'hero', maxCount: 1 },
        { name: 'gallery', maxCount: 16 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  async updateById(
    @Param('id') id: string,
    @Body() body: UpdateBlogDto & Record<string, any>,
    @CurrentUser() currentUser: any,
    @UploadedFiles() files?: UploadFiles,
  ) {
    if (!id) throw new BadRequestException('Missing blog id');
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }

    return this.blogsService.updateOneForAuthor(
      id,
      currentUser._id,
      body,
      files,
    );
  }

  @Get()
  async listMyBlogs(
    @CurrentUser() currentUser: any,
    @Query() query: QueryBlogsDto,
  ) {
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }
    return this.blogsService.listForAuthor(currentUser._id, query);
  }

  @Delete(':id')
  async deleteMyBlog(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    if (!id) throw new BadRequestException('Missing blog id');
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }
    return this.blogsService.deleteForAuthor(id, currentUser._id);
  }
}
