// src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';


import { MenuItem, MenuItemSchema } from 'src/menu/schema/menu.schema';
import { Restaurant, RestaurantSchema } from 'src/restaurants/schema/restaurant.schema';
import { PreOrderService } from './orders.service';
import { PreOrderController } from './pre-order.controller';
import { PreOrder, PreOrderItem, PreOrderItemSchema, PreOrderSchema } from './schema/order.schema';
import { User, UserSchema } from 'src/users/schema/user.schema';
import { UsersService } from 'src/users/users.service';


@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: PreOrder.name, schema: PreOrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PreOrderController],
  providers: [PreOrderService,UsersService],
  exports: [PreOrderService],
})
export class OrdersModule { }
