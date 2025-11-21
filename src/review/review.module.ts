import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { Review, ReviewSchema } from './schema/review.schema';
import {
  Restaurant,
  RestaurantSchema,
} from '../restaurants/schema/restaurant.schema'; // ✅ Thêm dòng này
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    // 🧱 Đăng ký cả Review và Restaurant cho Mongoose
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Restaurant.name, schema: RestaurantSchema }, // ✅ Thêm dòng này để inject được RestaurantModel
    ]),
    forwardRef(() => UploadModule),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
