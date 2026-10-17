import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const SECRET_KEYS: Record<string, true> = {
  password: true,
  currentPassword: true,
  newPassword: true,
  cardNumber: true,
  cvc: true,
  idempotencyKey: true,
};

function maskBody(value: unknown): unknown {
  if (Array.isArray(value)) return '[array]';
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k in SECRET_KEYS
        ? '[REDACTED]'
        : typeof v === 'object' && v !== null ? '[object]' : v;
    }
    return out;
  }
  return typeof value === 'string' ? '[string]' : value;
}

interface RequestUser { id?: number }
type AuthedRequest = Request & { user?: RequestUser };

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req: AuthedRequest = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const route = req.originalUrl ?? req.url ?? '';

    return next.handle().pipe(
      tap({
        next: () => this.write(this.line(req, route, res.statusCode, Date.now() - started)),
        error: (err) => {
          let status = 500;
          if (err && typeof err === 'object' && 'getStatus' in err) {
            status = (err as { getStatus: () => number }).getStatus();
          }
          this.write({
            ...this.line(req, route, status, Date.now() - started),
            body: maskBody(req.body),
          });
        },
      }),
    );
  }

  private line(req: AuthedRequest, path: string, status: number, durationMs: number) {
    return {
      time: new Date().toISOString(),
      method: req.method,
      path,
      status,
      durationMs,
      userId: req.user?.id ?? null,
    };
  }

  private write(line: Record<string, unknown>) {
    this.logger.log(JSON.stringify(line));
  }
}
