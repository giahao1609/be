// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { ChatModule } from './chatbot/chat.module';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { RestaurantModule } from './restaurants/restaurants.module';
import { ReviewModule } from './review/review.module';
import { UserHistoryModule } from './user-history/user-history.module';
import { AdminModule } from './admin/admin.module';
import { RedisModule } from './redis/redis.module';
import { AppModuleProvider } from './common/module-provider';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database.module';
import { CategoriesModule } from './category/categories.module';
import { OwnerMenuItemsModule } from './menu/owner-menu-items.module';
import { OrdersModule } from './order/orders.module';
import { BlogsModule } from './blog/blogs.module';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forRoot(AppModuleProvider.getConfigurationOptions()),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        type: 'mongodb',
        url: configService.get<string>('database.url'),
        database: configService.get<string>('database.name'),
        useUnifiedTopology: true,
        synchronize: false,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 10000,
          limit: 30,
        },
      ],
    }),

    RedisModule,

    ChatModule,
    AuthModule,
    UsersModule,
    UploadModule,
    RestaurantModule,
    ReviewModule,
    UserHistoryModule,
    AdminModule,
    CategoriesModule,
    OwnerMenuItemsModule,
    OrdersModule,
    BlogsModule
  ],
})
export class AppModule {}
