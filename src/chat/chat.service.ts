// src/chat/chat.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export type ChatRequest = {
    message: string;
    userId: string;
    sessionId?: string;
}

export type ChatResponse = {
    // tuỳ theo n8n trả gì, để any cho pass thẳng
    sessionId: string;
    userId: string;
    requestMessage: string;
    n8nRaw: any;
}

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly n8nUrl: string;

    constructor(
        private readonly http: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.n8nUrl = "https://api.eduguin.mtri.online/webhook/chatbothtq"
    }

    /**
     * Gửi message qua n8n và chờ response
     */
    async sendToN8n(payload: ChatRequest): Promise<ChatResponse> {
        const sessionId = payload.sessionId || uuidv4();

        const body = {
            message: payload.message,
            userId: payload.userId,
            sessionId,
        };

        this.logger.log(
            `Send to n8n: ${this.n8nUrl} ${JSON.stringify(body)}`,
        );

        const res = await firstValueFrom(
            this.http.post(this.n8nUrl, body, {
                timeout: 30_000, // 30s
            }),
        );

        const data = res.data;

        this.logger.log(`Received from n8n for session ${sessionId}`);

        return {
            sessionId,
            userId: payload.userId,
            requestMessage: payload.message,
            n8nRaw: data,
        };
    }
}
