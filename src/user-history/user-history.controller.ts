import { Controller, Get, Param, Post, Body, Delete } from "@nestjs/common";
import { UserHistoryService } from "./user-history.service";

@Controller("api/chat")
export class UserHistoryController {
  constructor(private readonly historyService: UserHistoryService) {}

  /** 🟢 Lưu tin nhắn (user hoặc bot) */
  @Post("save")
  async saveMessage(@Body() body: { userId: string; role: "user" | "bot"; text: string }) {
    return this.historyService.saveMessage(body.userId, body.role, body.text);
  }

  /** 🟢 Lấy lịch sử chat của user */
  @Get("history/:userId")
  async getUserHistory(@Param("userId") userId: string) {
    return this.historyService.getAllByUser(userId);
  }

  /** 🟢 Lấy thống kê chat (cho dashboard admin) */
  @Get("stats")
  async getChatStats() {
    return this.historyService.getChatStats();
  }

  /** 🟢 Xóa lịch sử chat của user */
  @Delete("clear/:userId")
  async clearUserHistory(@Param("userId") userId: string) {
    return this.historyService.clearHistory(userId);
  }
}
