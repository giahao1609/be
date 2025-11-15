import { Injectable } from "@nestjs/common";
import { RestaurantModule } from "../restaurants/restaurants.module";
import { ReviewModule } from "../review/review.module";
import { UsersModule } from "../users/users.module";
import { UserHistoryService } from "../user-history/user-history.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly userHistoryService: UserHistoryService
  ) {}

  async getStats() {
    const chatbotChart = await this.userHistoryService.getChatStats();

    return {
      restaurants: 124,
      reviews: 847,
      users: 356,
      files: 22,
      chatbotChart,
      reviewChart: [
        { date: "T2", reviews: 8 },
        { date: "T3", reviews: 12 },
        { date: "T4", reviews: 9 },
        { date: "T5", reviews: 15 },
        { date: "T6", reviews: 10 },
        { date: "T7", reviews: 20 },
        { date: "CN", reviews: 5 },
      ],
    };
  }
}
