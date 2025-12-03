// src/ai-dataset/ai-dataset.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Restaurant,
  RestaurantSchema,
} from 'src/restaurants/schema/restaurant.schema';

import {
  BlogPost,
  BlogSchema,
} from 'src/blog/schema/blog.schema';

import { AiDatasetService } from './ai-dataset.service';
import { AiDatasetController } from './ai-dataset.controller';
import { MenuItem, MenuItemSchema } from 'src/menu/schema/menu.schema';
import { Review, ReviewSchema } from 'src/review/schema/review.schema';
import { Category, CategorySchema } from 'src/category/schema/category.schema';
import { UploadService } from 'src/upload/upload.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Category.name, schema: CategorySchema },
      { name: BlogPost.name, schema: BlogSchema },
    ]),
  ],
  providers: [AiDatasetService, UploadService],
  controllers: [AiDatasetController],
  exports: [AiDatasetService],
})
export class AiDatasetModule {}
