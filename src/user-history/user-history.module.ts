import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserHistory, UserHistorySchema } from "./schemas/user-history.schema";
import { UserHistoryService } from "./user-history.service";
import { UserHistoryController } from "./user-history.controller";

@Module({
  imports: [MongooseModule.forFeature([{ name: UserHistory.name, schema: UserHistorySchema }])],
  providers: [UserHistoryService],
  controllers: [UserHistoryController],
  exports: [UserHistoryService],
})
export class UserHistoryModule {}
