// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { UsersModule } from 'src/users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schema/user.schema';
import { RolesGuard } from './guards/roles.guard';
import { AdminGuard } from './guards/admin.guard';
import { OwnerGuard } from './guards/owner.guard';
import { UserGuard } from './guards/user.guard';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (cs: ConfigService) => ({
        secret: cs.get<string>('jwt.secretKey') ?? 'change_me_please',
        signOptions: cs.get('jwt.signOptions') ?? { expiresIn: '1h' },
      }),
    }),

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

  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    RolesGuard,
    AdminGuard,
    OwnerGuard,
    UserGuard,
    // JwtAuthGuard
  ],

  controllers: [AuthController],

  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    JwtStrategy,
    RolesGuard,
    AdminGuard,
    OwnerGuard,
    UserGuard,
    // JwtAuthGuard
  ],
})
export class AuthModule {}
