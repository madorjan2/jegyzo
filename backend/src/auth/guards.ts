import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express-serve-static-core';
import { JwtService } from './jwt.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../db/prisma.service';

interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

const ROLES_KEY = 'required_roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new ApiError('UNAUTHENTICATED');

    let payload;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new ApiError('AUTH_TOKEN_EXPIRED');
    }
    if (payload.type !== 'access') throw new ApiError('UNAUTHENTICATED');

    // Server-side role check: the token alone is not trusted for state changes
    // when the account has been deactivated since issuance (BR-21/NFR-16).
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new ApiError('AUTH_USER_INACTIVE');

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.includes(user.role)) throw new ApiError('FORBIDDEN');

    req.user = { id: user.id, role: user.role };
    return true;
  }
}
