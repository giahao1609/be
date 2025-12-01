// src/pre-order/pre-order.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Patch,
} from '@nestjs/common';

import { PreOrderService } from './orders.service';
import { CreatePreOrderDto } from './dto/create-order.dto';
import { MarkPaidDto, RequestDepositDto, UpdatePreOrderStatusDto } from './dto/update-status.dto';
import { CurrentUser } from 'src/decorators/current-user.decorator';


// import JwtAuthGuard, RolesGuard, etc. tuỳ hệ thống auth của ông

@Controller('pre-orders')
export class PreOrderController {
  constructor(private readonly preOrderService: PreOrderService) {}

  /**
   * User tạo pre-order
   * status mặc định: PENDING
   */
  @Post()
  // @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() currentUser: any,
    @Body() dto: CreatePreOrderDto,
  ) {
    return this.preOrderService.createForUser(currentUser._id, dto);
  }

  /**
   * User xem danh sách pre-order của chính mình
   */
  @Get('me')
  // @UseGuards(JwtAuthGuard)
  async myPreOrders(@CurrentUser() currentUser: any) {
    return this.preOrderService.listForUser(currentUser._id);
  }

  /**
   * Owner xem pre-order theo restaurant
   */
  @Get('restaurant/:restaurantId')
  // @UseGuards(JwtAuthGuard, RolesGuard) // check owner
  async forRestaurant(@Param('restaurantId') restaurantId: string) {
    return this.preOrderService.listForRestaurant(restaurantId);
  }

  /**
   * Owner yêu cầu cọc X% + gửi email thanh toán
   * Flow:
   *  - set depositPercent
   *  - tính requiredDepositAmount dựa trên totalAmount (nếu chưa truyền sẵn)
   *  - set status = AWAITING_PAYMENT
   *  - set paymentEmailSentAt
   *  - gửi email cho user
   */
  @Patch(':id/request-deposit')
  // @UseGuards(JwtAuthGuard, RolesGuard) // owner
  async requestDeposit(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
    @Body() dto: RequestDepositDto,
  ) {
    return this.preOrderService.requestDeposit(currentUser._id, id, dto);
  }

  /**
   * Đánh dấu pre-order đã thanh toán (webhook / owner tick)
   * Flow:
   *  - set status = PAID
   *  - set paidAt, paymentReference,...
   */
  @Patch(':id/mark-paid')
  // @UseGuards(JwtAuthGuard, RolesGuard) // owner / system
  async markPaid(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
  ) {
    return this.preOrderService.markPaid(currentUser._id, id, dto);
  }

  /**
   * Owner confirm đặt chỗ (sau khi đã thanh toán
   * hoặc nhà hàng không yêu cầu cọc)
   * Flow:
   *  - set status = CONFIRMED
   */
  @Patch(':id/confirm')
  // @UseGuards(JwtAuthGuard, RolesGuard) // owner
  async confirm(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
  ) {
    return this.preOrderService.confirm(currentUser._id, id);
  }

  /**
   * Update status chung:
   *  - User: CANCELLED (huỷ)
   *  - Owner: REJECTED (từ chối)
   * (không dùng cho AWAITING_PAYMENT / PAID / CONFIRMED
   * vì đã có route riêng ở trên cho dễ control logic)
   */
  @Patch(':id/status')
  // @UseGuards(JwtAuthGuard) // tuỳ role
  async updateStatus(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
    @Body() dto: UpdatePreOrderStatusDto,
  ) {
    return this.preOrderService.updateStatus(currentUser._id, id, dto);
  }
}
