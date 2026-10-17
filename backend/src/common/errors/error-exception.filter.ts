import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import { ALL_ERRORS, ErrorCode } from './error-codes';

function pickLanguage(req: Request): 'hu' | 'en' {
  const al = String(req.headers['accept-language'] ?? '').toLowerCase();
  if (al.includes('hu')) return 'hu';
  if (al.includes('en')) return 'en';
  return 'hu';
}

function resolveCode(exception: unknown): { code: ErrorCode; extra?: unknown } {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    let extra: unknown;
    let payloadCode: ErrorCode | undefined;
    if (payload !== null && typeof payload === 'object') {
      const rec = payload as Record<string, unknown>;
      if (typeof rec.code === 'string' && rec.code in ALL_ERRORS) {
        payloadCode = rec.code as ErrorCode;
      }
      if ('details' in rec) extra = rec.details;
    }
    if (payloadCode) return { code: payloadCode, extra };
    if (status === HttpStatus.UNAUTHORIZED) return { code: 'UNAUTHENTICATED' };
    if (status === HttpStatus.FORBIDDEN) return { code: 'FORBIDDEN' };
    if (status === HttpStatus.NOT_FOUND) return { code: 'NOT_FOUND' };
    if (status === HttpStatus.TOO_MANY_REQUESTS) return { code: 'RATE_LIMITED' };
    if (status >= 400 && status < 500) return { code: 'VALIDATION_ERROR', extra };
    return { code: 'INTERNAL_ERROR' };
  }
  return { code: 'INTERNAL_ERROR' };
}

@Catch()
export class ErrorExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('errors');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const req: Request = host.switchToHttp().getRequest();
    const res: Response | undefined = host.switchToHttp().getResponse();
    if (!httpAdapter || !req || !res) {
      // Very early failure; log and give up without leaking internals.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      return;
    }

    const { code, extra } = resolveCode(exception);
    const def = ALL_ERRORS[code];
    const lang = pickLanguage(req);

    if (code === 'INTERNAL_ERROR') {
      this.logger.error(
        exception instanceof Error ? `${exception.message}\n${exception.stack}` : String(exception),
      );
    }

    const body: Record<string, unknown> = {
      error: {
        code,
        message: def[lang],
        messageEn: def.en,
        ...(extra !== undefined ? { details: extra } : {}),
      },
    };
    const status = exception instanceof HttpException ? exception.getStatus() : def.http;
    httpAdapter.reply(res, body, status);
  }
}
