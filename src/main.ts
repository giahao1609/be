import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {});

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const globalPrefix = config.get<string>('app.globalPrefix') ?? '/api/v1';
  app.setGlobalPrefix(globalPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // const corsOrigins =
  //   (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
  //     .split(',')
  //     .map((s) => s.trim())
  //     .filter(Boolean);

  // app.enableCors({
  //   origin: corsOrigins,
  //   credentials: true,
  // });

  // app.enableCors({
  //   origin: '*',
  // });

  app.enableCors({
    origin: (origin, callback) => {
      // cho phép cả localhost và domain production
      const whitelist = [
        'http://localhost:3000',
        'https://food-map.online',
        'https://www.food-map.online'
      ];

      if (!origin || whitelist.includes(origin)) {
        callback(null, origin); // cho origin đó
      } else {
        callback(new Error('Not allowed by CORS'), null);
      }
    },
    credentials: true,
  });


  const port =
    Number(config.get<number>('app.port')) || Number(process.env.PORT) || 3001;

  await app.listen(port);

  logger.log(
    `🚀 Server running at http://localhost:${port}${globalPrefix === '/' ? '' : globalPrefix}`,
  );
}

bootstrap();
