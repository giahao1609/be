// src/chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { ChatService } from './chat.service';
import type { ChatRequest } from './chat.service';
@WebSocketGateway({
  namespace: 'socketUser', // ws://.../socketUser
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) { }

  // ================== HELPER: lấy userId từ socket ==================

  /** 
   * Lấy userId từ auth / query khi handshake 
   * FE nên connect kiểu:
   * io('/socketUser', { auth: { userId: '123' } })
   */
  private getUserIdFromClient(client: Socket): string | null {
    const authUserId = (client.handshake.auth as any)?.userId;
    const queryUserId = (client.handshake.query as any)?.userId;

    const userId = authUserId || queryUserId;
    if (!userId || typeof userId !== 'string') return null;
    return userId;
  }

  /** Tên room chuẩn cho 1 user */
  private getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  // ================== LIFECYCLE: connect / disconnect ==================

  async handleConnection(client: Socket) {
    const userId = this.getUserIdFromClient(client);
    if (!userId) {
      this.logger.warn(
        `Client ${client.id} connected WITHOUT userId (auth/query).`,
      );
      return;
    }

    const room = this.getUserRoom(userId);
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  async handleDisconnect(client: Socket) {
    const userId = this.getUserIdFromClient(client);
    if (userId) {
      const room = this.getUserRoom(userId);
      this.logger.log(`Client ${client.id} disconnected from room ${room}`);
    } else {
      this.logger.log(`Client ${client.id} disconnected`);
    }
  }

  // Optional: nếu user login sau khi socket đã connect
  // FE có thể emit event "chat:identify" để join room
  @SubscribeMessage('chat:identify')
  async handleIdentify(
    @MessageBody() body: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = body || {};
    if (!userId) {
      client.emit('chat:error', { error: 'Missing userId in identify' });
      return;
    }

    const room = this.getUserRoom(userId);
    client.join(room);
    this.logger.log(`Client ${client.id} identify & joined room ${room}`);

    client.emit('chat:identified', { userId, room });
  }

  // ================== MAIN: chat:message ==================

  /**
   * FE gửi:
   * socket.emit('chat:message', {
   *   message: 'Cho tôi xin Giáo Viên Hóa học',
   *   userId: '123',         // nên trùng với auth userId
   *   sessionId: '5567',     // optional, BE tự tạo nếu thiếu
   * });
   */
  @SubscribeMessage('chat:message')
  async handleUserMessage(
    @MessageBody() body: ChatRequest,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      let { message, userId, sessionId } = body || {};

      if (!message) {
        client.emit('chat:error', { error: 'Missing message' });
        return;
      }

      // Nếu userId trong body không có, thử lấy từ socket
      if (!userId) {
        const fromSocket = this.getUserIdFromClient(client);
        if (!fromSocket) {
          client.emit('chat:error', { error: 'Missing userId' });
          return;
        }
        userId = fromSocket;
      }

      if (!sessionId) {
        sessionId = uuidv4();
      }

      const room = this.getUserRoom(userId);
      // đảm bảo socket hiện tại join room (idempotent)
      client.join(room);

      this.logger.log(
        `chat:message user=${userId} session=${sessionId} message="${message}"`,
      );

      // Notify tất cả thiết bị/tab của user là đang xử lý
      this.server.to(room).emit('chat:processing', {
        userId,
        sessionId,
        message,
      });

      // Gửi qua n8n và chờ response
      const resp = await this.chatService.sendToN8n({
        message,
        userId,
        sessionId,
      });

      // Map n8nRaw -> replyText (tuỳ format n8n trả)
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

      // Emit response cho TẤT CẢ socket của user (multi device / tab)
      this.server.to(room).emit('chat:response', {
        userId,
        sessionId: resp.sessionId,
        requestMessage: resp.requestMessage,
        reply: replyText,
        raw: resp.n8nRaw,
      });
    } catch (error: any) {
      this.logger.error('Error handleUserMessage', error?.stack || error);
      client.emit('chat:error', {
        error: 'Failed to process chat message',
      });
    }
  }
}
