/**
 * Vercel serverless entry for the NestJS API.
 * Set the Vercel project's Root Directory to `apps/api` — that is where the
 * Nest dependencies are installed.
 *
 * The Nest app is built once per warm container and reused, so only a cold start
 * pays bootstrap cost. Everything under /v1 is served from here.
 *
 * NOT suitable for provider ingestion: a Vercel function is killed as soon as it
 * responds (and is hard-capped by maxDuration), so a full import cannot run
 * inside one. The cron entry in vercel.json enqueues instead — see docs/DEPLOYMENT.md.
 *
 * Deliberately outside `src/`, so `nest build` (tsconfig include: src/**) ignores it.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from '../src/app.module';
import { TransformResponseInterceptor } from '../src/modules/core/interceptors/transform-response.interceptor';

let cachedHandler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;

async function createHandler() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.enableCors();

  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cachedHandler ??= await createHandler();
  return cachedHandler(req, res);
}
