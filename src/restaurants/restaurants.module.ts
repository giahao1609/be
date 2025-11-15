import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Restaurant, RestaurantSchema } from './schema/restaurant.schema';
import { OwnerRestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { UploadModule } from '../upload/upload.module';
import { UsersService } from 'src/users/users.service';
import { UsersModule } from 'src/users/users.module';
import { User, UserSchema } from 'src/users/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UploadModule),
    UsersModule,
  ],
  controllers: [OwnerRestaurantsController],
  providers: [RestaurantsService, UsersService],
  exports: [RestaurantsService],
})
export class RestaurantModule {}
