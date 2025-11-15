import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Category, CategorySchema } from './schema/category.schema';
import { AdminCategoriesController } from './owner-categories.controller';
import { AdminCategoriesService } from './owner-categories.service';



@Module({
  imports: [
    MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }]),
  ],
  controllers: [AdminCategoriesController],
  providers: [AdminCategoriesService],
  exports: [AdminCategoriesService],
})
export class CategoriesModule {}
