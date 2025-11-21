// src/orders/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from 'src/decorators/current-user.decorator';
// import { CurrentUser } from '@/auth/current-user.decorator';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Tạo order + tạo thanh toán ZaloPay
  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.ordersService.createForUser(currentUser._id, dto);
  }

  // Lấy detail order của current user
  @Get(':id')
  async getDetail(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.ordersService.getDetail(id, currentUser._id);
  }

  // Webhook ZaloPay callback
  @Post('zalopay/callback')
  async zaloCallback(@Body() body: any) {
    // endpoint này ZaloPay sẽ gọi, thường không có auth
    return this.ordersService.handleZaloPayCallback(body);
  }
}
