import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** Creates the API with all its middleware. Shared by the long-running server and the serverless entry. */
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // the billing webhook is signed over the exact bytes sent
  });
  // Behind a load balancer / the web server, trust that many proxy hops so rate limits see real client IPs.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet());
  app.useBodyParser('json', { limit: '2mb' }); // stamp and signature images are sent as base64
  app.enableCors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}
