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
import { UsersService } from 'src/users/users.service';
import { User, UserSchema } from 'src/users/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UploadModule),
  ],
  controllers: [ReviewController],
  providers: [ReviewService, UsersService],
  exports: [ReviewService],
})
export class ReviewModule {}
