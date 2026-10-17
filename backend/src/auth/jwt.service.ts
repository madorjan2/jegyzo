import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { validateEnvProcess } from '../config/env';

export interface JwtPayload {
  sub: number;
  role: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtService {
  private readonly secret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor() {
    const env = validateEnvProcess();
    this.secret = env.JWT_SECRET;
    this.accessTtl = env.JWT_ACCESS_TTL_SECONDS;
    this.refreshTtl = env.JWT_REFRESH_TTL_SECONDS;
  }

  signAccess(userId: number, role: string): string {
    return jwt.sign(
      { sub: userId, role, type: 'access', jti: `a${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } satisfies JwtPayload & { jti: string },
      this.secret,
      { expiresIn: this.accessTtl },
    );
  }

  signRefresh(userId: number, role: string): string {
    // jti avoids a duplicate token if two calls land in the same second; the
    // RefreshToken table has a unique tokenHash column.
    return jwt.sign(
      { sub: userId, role, type: 'refresh', jti: `r${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } satisfies JwtPayload & { jti: string },
      this.secret,
      { expiresIn: this.refreshTtl },
    );
  }

  verify(token: string): JwtPayload {
    return jwt.verify(token, this.secret) as unknown as JwtPayload;
  }
}
