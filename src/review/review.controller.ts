import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Types } from 'mongoose';

import { ReviewService } from './review.service';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@Controller('restaurants/:restaurantId/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ===== CREATE =====
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async create(
    @CurrentUser() currentUser: any,
    @Param('restaurantId') restaurantId: string,
    @Body() body: Record<string, any>,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
    },
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }

    const content = String(body.content || '').trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }

    const ratingNum = Number(body.rating ?? 0);
    if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      throw new BadRequestException('rating must be between 0 and 5');
    }

    return this.reviewService.createWithUploads(
      currentUser._id,
      restaurantId,
      {
        content,
        rating: ratingNum,
      },
      files?.images ?? [],
    );
  }

  // ===== UPDATE =====
  @Post(':id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 24 }], {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
    },
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }

    const content = String(body.content || '').trim();
    const ratingRaw = body.rating;
    const rating =
      ratingRaw === undefined || ratingRaw === null
        ? undefined
        : Number(ratingRaw);

    // helper parse flags giống owner-menu-items
    const parseBool = (v: any) =>
      typeof v === 'string' ? v.toLowerCase() === 'true' : !!v;

    const parseJsonArray = (v: any): string[] => {
      if (!v) return [];
      try {
        if (typeof v === 'string') return JSON.parse(v);
        if (Array.isArray(v)) return v;
      } catch {
        return [];
      }
      return [];
    };

    const flags = {
      imagesMode:
        (body.imagesMode as 'append' | 'replace' | 'remove') ?? 'append',
      removeAllImages: parseBool(body.removeAllImages),
      imagesRemovePaths: parseJsonArray(body.imagesRemovePaths),
    };

    return this.reviewService.updateWithUploads(
      restaurantId,
      id,
      {
        content,
        rating,
      },
      files?.images ?? [],
      flags,
    );
  }

  // ===== DELETE =====
  @Delete(':id')
  async delete(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
  ) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }

    return this.reviewService.deleteReview(restaurantId, id);
  }

  // ===== LIST BY RESTAURANT =====
  // GET /restaurants/:restaurantId/reviews
 @Get()
  async getByRestaurant(@Param('restaurantId') restaurantId: string) {
    if (!Types.ObjectId.isValid(restaurantId)) {
      throw new BadRequestException('Invalid restaurantId');
    }

    const data =
      await this.reviewService.getReviewsByRestaurantWithUser(restaurantId);

    return {
      success: true,
      message: 'Reviews fetched successfully',
      data,
    };
  }
}
