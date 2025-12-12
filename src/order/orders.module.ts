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
import { UploadService } from 'src/upload/upload.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';


@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: PreOrder.name, schema: PreOrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (cs: ConfigService) => {
        const host = cs.get<string>('mailing.smtp.host') ?? 'smtp.gmail.com';
        const port = Number(cs.get<number>('mailing.smtp.port') ?? 587);
        const secure =
          (cs.get<boolean>('mailing.smtp.secure') ?? String(port) === '465') ||
          false;

        const user = cs.get<string>('mailing.smtp.user');
        const pass = cs.get<string>('mailing.smtp.pass');
        const from =
          cs.get<string>('mailing.smtp.from') ??
          '"FoodMap" <no-reply@foodmap.vn>';

        return {
          transport: {
            host,
            port,
            secure,
            auth: user && pass ? { user, pass } : undefined,
          },
          defaults: { from },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  controllers: [PreOrderController],
  providers: [PreOrderService, UsersService, UploadService],
  exports: [PreOrderService],
})
export class OrdersModule { }
