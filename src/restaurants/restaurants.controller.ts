import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import type { Request } from 'express';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/guards/roles.decorator';
import { BusinessExceptionFilter } from 'src/filters/business-exception.filter';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  OwnerRestaurantsQueryDto,
  QueryRestaurantsDto,
} from './dto/query-restaurants.dto';
import { Types } from 'mongoose';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { NearbyRestaurantsQueryDto } from './dto/nearby-restaurants.dto';

type AuthUser = { sub?: string; id?: string; roles?: string[] };
export type UploadFiles = {
  logo?: Express.Multer.File[];
  cover?: Express.Multer.File[];
  gallery?: Express.Multer.File[];

  // QR chuyển khoản ngân hàng
  bankQrs?: Express.Multer.File[];

  // QR ví điện tử
  ewalletQrs?: Express.Multer.File[];
};

@Controller('owner/restaurants')
@UseFilters(BusinessExceptionFilter)
// @UseGuards(JwtAuthGuard, RolesGuard)
export class OwnerRestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  // @Post()
  // @UseInterceptors(
  //   FileFieldsInterceptor(
  //     [
  //       { name: 'logo', maxCount: 1 },
  //       { name: 'cover', maxCount: 1 },
  //       { name: 'gallery', maxCount: 16 },
  //     ],
  //     { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
  //   ),
  // )
  // async create(
  //   @Body() body: CreateRestaurantDto,
  //   @CurrentUser() currentUser: any,
  //   @UploadedFiles()
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  // ) {
  //   return this.restaurantsService.createWithUploads(
  //     body,
  //     currentUser._id,
  //     files,
  //   );
  // }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
        { name: 'gallery', maxCount: 16 },

        // 👇 thêm 2 field cho QR thanh toán
        { name: 'bankQrs', maxCount: 20 },
        { name: 'ewalletQrs', maxCount: 20 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  async create(
    @Body() body: CreateRestaurantDto & Record<string, any>,
    @CurrentUser() currentUser: any,
    @UploadedFiles() files?: UploadFiles,
  ) {
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }

    // CreateRestaurantDto có thể bị FE gửi JSON string cho một số field
    // phần parse/normalize & upload ảnh/QR đã xử ở service.createWithUploads
    return this.restaurantsService.createWithUploads(
      body as CreateRestaurantDto,
      currentUser._id,
      files,
    );
  }

  // @Patch(':id')
  // @UseInterceptors(
  //   FileFieldsInterceptor(
  //     [
  //       { name: 'logo', maxCount: 1 },
  //       { name: 'cover', maxCount: 1 },
  //       { name: 'gallery', maxCount: 16 },
  //     ],
  //     { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
  //   ),
  // )
  // async updateById(
  //   @Param('id') id: string,
  //   @Body() body: UpdateRestaurantDto & Record<string, any>,
  //   @CurrentUser() currentUser: any,
  //   @UploadedFiles()
  //   files?: {
  //     logo?: Express.Multer.File[];
  //     cover?: Express.Multer.File[];
  //     gallery?: Express.Multer.File[];
  //   },
  // ) {
  //   if (!id) throw new BadRequestException('Missing restaurant id');

  //   const parseBool = (v: any) =>
  //     typeof v === 'string' ? v.toLowerCase() === 'true' : !!v;

  //   const parseJsonArray = (v: any): string[] => {
  //     if (!v) return [];
  //     try {
  //       if (typeof v === 'string') return JSON.parse(v);
  //       if (Array.isArray(v)) return v;
  //     } catch (_) {}
  //     return [];
  //   };

  //   const options = {
  //     removeLogo: parseBool(body.removeLogo),
  //     removeCover: parseBool(body.removeCover),
  //     galleryMode:
  //       (body.galleryMode as 'append' | 'replace' | 'remove') ?? 'append',
  //     galleryRemovePaths: parseJsonArray(body.galleryRemovePaths),
  //     removeAllGallery: parseBool(body.removeAllGallery),
  //   };

  //   return this.restaurantsService.updateByIdWithUploads(
  //     id,
  //     body,
  //     currentUser._id,
  //     files,
  //     options,
  //   );
  // }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
        { name: 'gallery', maxCount: 16 },

        // 👇 giống create: FE gửi QR mới khi muốn update
        { name: 'bankQrs', maxCount: 20 },
        { name: 'ewalletQrs', maxCount: 20 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  async updateById(
    @Param('id') id: string,
    @Body() body: UpdateRestaurantDto & Record<string, any>,
    @CurrentUser() currentUser: any,
    @UploadedFiles() files?: UploadFiles,
  ) {
    if (!id) throw new BadRequestException('Missing restaurant id');
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }

    const parseBool = (v: any) =>
      typeof v === 'string' ? v.toLowerCase() === 'true' : !!v;

    const parseJsonArray = (v: any): string[] => {
      if (!v) return [];
      try {
        if (typeof v === 'string') return JSON.parse(v);
        if (Array.isArray(v)) return v;
      } catch (_) {}
      return [];
    };

    // flags cho logo/cover/gallery
    const options = {
      removeLogo: parseBool(body.removeLogo),
      removeCover: parseBool(body.removeCover),
      galleryMode:
        (body.galleryMode as 'append' | 'replace' | 'remove') ?? 'append',
      galleryRemovePaths: parseJsonArray(body.galleryRemovePaths),
      removeAllGallery: parseBool(body.removeAllGallery),
      // QR thanh toán không cần flags riêng:
      // - gửi QR mới -> BE upload & overwrite qrImagePath theo index
      // - muốn remove qrImagePath -> FE gửi paymentConfig.bankTransfers[i].qrImagePath = null/"" (normalize ở service)
    };

    return this.restaurantsService.updateOneWithUploads(
      id,
      body,
      currentUser._id,
      files,
      options,
    );
  }

  @Get()
  async list(@Query() query: QueryRestaurantsDto) {
    return this.restaurantsService.findMany(query);
  }

  // GET /restaurants/:idOrSlug
  @Get('detail/:idOrSlug')
  async detail(@Param('idOrSlug') idOrSlug: string) {
    return this.restaurantsService.findDetail(idOrSlug);
  }

  @Get("get-by-owner")
  async listMyRestaurants(
    @CurrentUser() currentUser: any,
    @Query() query: OwnerRestaurantsQueryDto,
  ) {
    if (!currentUser || !currentUser._id) {
      throw new BadRequestException('Current user is required');
    }

    return this.restaurantsService.findByOwnerId(currentUser._id, query);
  }

  @Get('nearby')
  async getNearby(@Query() query: NearbyRestaurantsQueryDto) {
    return this.restaurantsService.findNearby(query);
  }
}
