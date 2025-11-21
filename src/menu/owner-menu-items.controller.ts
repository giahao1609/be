import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { OwnerMenuItemsService } from './owner-menu-items.service';

import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Types } from 'mongoose';
import { QueryMenuItemsDto } from './dto/query-menu-items.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('owner', 'admin')
@Controller('owner/restaurants/:restaurantId/menu-items')
export class OwnerMenuItemsController {
  constructor(private readonly service: OwnerMenuItemsService) {}

  // owner-menu-items.controller.ts
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() body: CreateMenuItemDto,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }

    // gán lại để service (hoặc nơi khác) có thể dùng nếu cần
    body.restaurantId = restaurantId;

    return this.service.createWithUploads(
      body,
      restaurantId,
      files?.images ?? [],
    );
  }

  // UPDATE
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() body: UpdateMenuItemDto & Record<string, any>,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }

    const parseBool = (v: any) =>
      typeof v === 'string' ? v.toLowerCase() === 'true' : !!v;
    const parseJsonArray = (v: any): string[] => {
      if (!v) return [];
      try {
        if (typeof v === 'string') return JSON.parse(v);
        if (Array.isArray(v)) return v;
      } catch {}
      return [];
    };

    const flags = {
      imagesMode:
        (body.imagesMode as 'append' | 'replace' | 'remove') ?? 'append',
      removeAllImages: parseBool(body.removeAllImages),
      imagesRemovePaths: parseJsonArray(body.imagesRemovePaths),
    };

    return this.service.updateWithUploads(
      restaurantId,
      id,
      body,
      files?.images ?? [],
      flags,
    );
  }

  // @Post()
  // @UseInterceptors(
  //   FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
  //     storage: memoryStorage(),
  //     limits: { fileSize: 10 * 1024 * 1024 },
  //   }),
  // )
  // async create(
  //   @Param('restaurantId') restaurantId: string,
  //   @Body() body: CreateMenuItemDto,
  //   @UploadedFiles() files?: { images?: Express.Multer.File[] },
  // ) {
  //   if (!Types.ObjectId.isValid(restaurantId)) {
  //     throw new BadRequestException('Invalid restaurantId');
  //   }
  //   // ensure dto.restaurantId = param
  //   body.restaurantId = restaurantId;
  //   // image flags via multipart (optional)
  //   return this.service.create(body, files?.images);
  // }

  // LIST
  @Get()
  async list(
    @Param('restaurantId') restaurantId: string,
    @Query() query: QueryMenuItemsDto,
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    return this.service.findMany(restaurantId, query);
  }

  // DETAIL (id or slug)
  @Get(':idOrSlug')
  async detail(
    @Param('restaurantId') restaurantId: string,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    return this.service.findDetail(restaurantId, idOrSlug);
  }

  // // UPDATE
  // @Patch(':id')
  // @UseInterceptors(
  //   FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
  //     storage: memoryStorage(),
  //     limits: { fileSize: 10 * 1024 * 1024 },
  //   }),
  // )
  // async update(
  //   @Param('restaurantId') restaurantId: string,
  //   @Param('id') id: string,
  //   @Body() body: UpdateMenuItemDto & Record<string, any>,
  //   @UploadedFiles() files?: { images?: Express.Multer.File[] },
  // ) {
  //   if (!Types.ObjectId.isValid(restaurantId)) {
  //     throw new BadRequestException('Invalid restaurantId');
  //   }
  //   if (!Types.ObjectId.isValid(id)) {
  //     throw new BadRequestException('Invalid id');
  //   }

  //   // Các cờ điều khiển ảnh qua multipart:
  //   const parseBool = (v: any) =>
  //     typeof v === 'string' ? v.toLowerCase() === 'true' : !!v;
  //   const parseJsonArray = (v: any): string[] => {
  //     if (!v) return [];
  //     try {
  //       if (typeof v === 'string') return JSON.parse(v);
  //       if (Array.isArray(v)) return v;
  //     } catch {}
  //     return [];
  //   };

  //   const flags = {
  //     imagesMode:
  //       (body.imagesMode as 'append' | 'replace' | 'remove') ?? 'append',
  //     removeAllImages: parseBool(body.removeAllImages),
  //     imagesRemovePaths: parseJsonArray(body.imagesRemovePaths),
  //   };

  //   return this.service.updateById(
  //     restaurantId,
  //     id,
  //     body,
  //     files?.images,
  //     flags,
  //   );
  // }

  // DELETE
  @Delete(':id')
  async remove(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return this.service.removeById(restaurantId, id);
  }

  // @Get(':id')
  // async detail(@Param('id') id: string) {
  //   if (!Types.ObjectId.isValid(id)) {
  //     throw new BadRequestException('Invalid id');
  //   }
  //   return this.service.findById(id);
  // }
}
