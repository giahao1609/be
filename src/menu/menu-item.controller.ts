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
import { QueryFeaturedRestaurantsDto, QueryMenuItemsDto, QueryTopDiscountedDto, SearchMenuItemsDto } from './dto/query-menu-items.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('owner', 'admin')
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly service: OwnerMenuItemsService) { }

  @Get('top-discounted')
  async getTopDiscounted(@Query() query: QueryTopDiscountedDto) {
    const data = await this.service.findTopDiscounted(query);
    return {
      success: true,
      message: 'Top discounted menu items fetched successfully',
      data,
    };
  }

  @Get('featured')
  async getFeatured(@Query() q: QueryFeaturedRestaurantsDto) {
    const data = await this.service.getFeaturedRestaurants(q);
    return {
      success: true,
      message: 'Featured restaurants fetched successfully',
      data,
    };
  }

  @Get('search')
  async search(@Query() query: SearchMenuItemsDto) {
    if (!query.q || !query.q.trim()) {
      throw new BadRequestException('Query "q" is required');
    }

    const data = await this.service.searchMenuItemsGlobal(query.q.trim(), {
      page: query.page,
      limit: query.limit,
    });

    return {
      success: true,
      message: 'Menu items searched successfully',
      data,
    };
  }
}
