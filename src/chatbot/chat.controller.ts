import { Controller, Post, Body } from "@nestjs/common";
import { ChatService } from "./service/chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** 💬 Chat chính — hỗ trợ vị trí nếu có */
  @Post("ask")
  async ask(
    @Body("message") message: string,
    @Body("lat") lat?: number,
    @Body("lng") lng?: number
  ) {
    return this.chatService.askWithKnowledge(message, lat, lng);
  }

  /** 🍽 Gợi ý món ăn nhanh theo từ khóa */
  @Post("suggest")
  async suggest(@Body("prompt") prompt: string) {
    return this.chatService.suggestFood(prompt);
  }
}
