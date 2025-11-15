import { Module } from "@nestjs/common";
import { AdminService } from "./admin.service";

import { RestaurantModule } from "../restaurants/restaurants.module";
import { ReviewModule } from "../review/review.module";
import { UsersModule } from "../users/users.module";
import { UserHistoryModule } from "../user-history/user-history.module";
import { AdminUsersController } from "./admin.controller";

@Module({
  imports: [RestaurantModule, ReviewModule, UsersModule, UserHistoryModule],
  controllers: [AdminUsersController],
  providers: [AdminService],
})
export class AdminModule {}
