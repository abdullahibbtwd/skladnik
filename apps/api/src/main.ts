import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // req.ip honours X-Forwarded-For only from private-network proxies (nginx, Vite), so rate limits can't be dodged by spoofing it.
  app.set('trust proxy', config.get<string>('TRUST_PROXY') ?? 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');
  app.use(
    helmet({
      // API responses are JSON; CSP belongs on the nginx-served SPA.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176',
    credentials: true,
  });

  const port = Number(config.get<string>('PORT') ?? process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}`);
}

void bootstrap();
