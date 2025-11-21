// src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

import {
  Order,
  OrderSchema,
} from './schema/order.schema';
import { MenuItem, MenuItemSchema } from 'src/menu/schema/menu.schema';
import { Restaurant, RestaurantSchema } from 'src/restaurants/schema/restaurant.schema';


@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
