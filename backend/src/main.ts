import 'reflect-metadata';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import Express from 'express';
import { ExRequest, ExResponse } from './types/express';
import { AppModule } from './app.module';
import { ErrorExceptionFilter } from './common/errors/error-exception.filter';
import { LoggingInterceptor } from './common/logging/logging.interceptor';
import { validateEnv } from './config/env';
import { PrismaService } from './db/prisma.service';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const env = validateEnv(process.env as unknown as Record<string, string>);
  const logger = new NestLogger('bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // /health must live outside the /api prefix (docker contract); the Express
  // app handles it directly, so Nest's global prefix does not rewrite it.
  const expressApp = app.getHttpAdapter().getInstance() as unknown as Express.Application;
  expressApp.get('/health', (req: ExRequest, res: ExResponse) => {
    void req;
    const json = (status: number, body: Record<string, string>) => {
      const chain = res.status(status);
      chain.json(body);
    };
    void app
      .get(PrismaService)
      .$queryRaw`SELECT 1`
      .then(() => json(200, { status: 'ok', api: 'ok', db: 'ok' }))
      .catch(() => json(503, { status: 'degraded', api: 'ok', db: 'unavailable' }));
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.setGlobalPrefix('api', { exclude: ['api/health'] });
  app.enableCors({
    origin: env.CORS_ORIGIN.split(',').map((o: string) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  });
  app.useGlobalInterceptors(new LoggingInterceptor());
  const httpAdapter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ErrorExceptionFilter(httpAdapter));

  const config = new DocumentBuilder()
    .setTitle('Jegyzo API')
    .setDescription('Ticket-selling QA sandbox API (/api subtree).')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`API listening on 0.0.0.0:${env.PORT}`);
}

void bootstrap();
