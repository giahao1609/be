import {
  ConfigModule,
  ConfigModuleOptions,
  ConfigService,
} from '@nestjs/config';
import process from 'process';
import config from '../common/configuration';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';

export class AppModuleProvider {
  static getConfigurationOptions(): ConfigModuleOptions {
    return {
      envFilePath: "env",
      isGlobal: true,
      load: [config],
    };
  }

  static getJWTConfiguration(): JwtModuleAsyncOptions {
    return {
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET_KEY'),
        signOptions: {
          expiresIn: configService.get('JWT_SIGN_OPTIONS_EXPIRES_IN'),
          issuer: configService.get('JWT_SIGN_OPTIONS_ISSUER'),
        },
        global: true,
      }),
    };
  }
}
