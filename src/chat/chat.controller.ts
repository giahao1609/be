// src/chat/chat.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { ChatRequest } from './chat.service';
@Controller('chat-ai')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post('ask')
    async ask(@Body() body: ChatRequest) {
        const resp = await this.chatService.sendToN8n(body);

        let replyText: string | null = null;
        if (resp?.n8nRaw) {
            if (typeof resp.n8nRaw === 'string') {
                replyText = resp.n8nRaw;
            } else if (resp.n8nRaw.reply) {
                replyText = resp.n8nRaw.reply;
            } else if (resp.n8nRaw.message) {
                replyText = resp.n8nRaw.message;
            }
        }

        return {
            sessionId: resp.sessionId,
            userId: resp.userId,
            requestMessage: resp.requestMessage,
            reply: replyText,
            raw: resp.n8nRaw,
        };
    }
}
