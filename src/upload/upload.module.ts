import { Module, forwardRef } from "@nestjs/common";
// import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { ScheduleModule } from "@nestjs/schedule";
import { ChatModule } from "../chatbot/chat.module"; // ✅ để inject VectorStoreService & EmbeddingsService
import { RestaurantModule } from "../restaurants/restaurants.module"; // ✅ để inject RestaurantsService

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChatModule,
    forwardRef(() => RestaurantModule), // ✅ thêm forwardRef
  ],
  // controllers: [],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
