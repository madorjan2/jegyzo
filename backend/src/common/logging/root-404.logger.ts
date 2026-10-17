// Logger for requests outside Nest's RxJS pipeline (unmatched routes, raw
// Express routes): writes the same JSON line shape as LoggingInterceptor, but
// from middleware so it also applies to requests Nest never routes.
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express-serve-static-core';

const SECRET_KEYS: Record<string, true> = {
  password: true,
  currentPassword: true,
  newPassword: true,
  cardNumber: true,
  cvc: true,
};

@Injectable()
export class Root404Logger implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(req: Request, res: Response, next: NextFunction) {
    const started = Date.now();
    res.on('finish', () => {
      const anyReq = req as Request & { user?: { id?: number } };
      this.logger.log(
        JSON.stringify({
          time: new Date().toISOString(),
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          durationMs: Date.now() - started,
          userId: anyReq.user?.id ?? null,
        }),
      );
    });
    next();
  }
}
