// src/pre-order/pre-order.controller.ts
import { Controller, Post, Body, UseGuards, Req, Get, Param, Patch } from '@nestjs/common';

import { UpdatePreOrderStatusDto } from './dto/update-status.dto';
import { PreOrderService } from './orders.service';
import { CreatePreOrderDto } from './dto/create-order.dto';
import { CurrentUser } from 'src/decorators/current-user.decorator';
// import JwtAuthGuard, RolesGuard, etc. tuỳ hệ thống auth của ông

@Controller('pre-orders')
export class PreOrderController {
    constructor(private readonly preOrderService: PreOrderService) { }

    @Post()
    // @UseGuards(JwtAuthGuard)
    async create(@CurrentUser() currentUser: any, @Body() dto: CreatePreOrderDto) {
        return this.preOrderService.createForUser(currentUser._id, dto);
    }

    @Get('me')
    // @UseGuards(JwtAuthGuard)
    async myPreOrders(@CurrentUser() currentUser: any,) {
        return this.preOrderService.listForUser(currentUser._id);
    }

    @Get('restaurant/:restaurantId')
    // @UseGuards(JwtAuthGuard, RolesGuard) // check owner
    async forRestaurant(@Param('restaurantId') restaurantId: string) {
        return this.preOrderService.listForRestaurant(restaurantId);
    }

    @Patch(':id/status')
    // @UseGuards(JwtAuthGuard, RolesGuard) // owner
    async updateStatus(@CurrentUser() currentUser: any, @Param('id') id: string, @Body() dto: UpdatePreOrderStatusDto) {
        return this.preOrderService.updateStatus(id, dto);
    }
}
