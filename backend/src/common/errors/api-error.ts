import { HttpException } from '@nestjs/common';
import { ALL_ERRORS, ErrorCode } from './error-codes';

// Extends HttpException so Nest's routing sees the right status, while the
// filter reads `code` from the response payload (resolveCode) to emit the
// unified error envelope with the catalog message.
export class ApiError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, details?: unknown) {
    const def = ALL_ERRORS[code];
    super({ code, details }, def.http);
    this.code = code;
    this.details = details;
  }
}
