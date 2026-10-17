import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError('AUTH_EMAIL_TAKEN');

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, rounds),
        fullName: dto.fullName,
        role: 'VASARLO',
      },
    });
    return this.publicUser(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const bad = new ApiError('AUTH_INVALID_CREDENTIALS');
    if (!user) throw bad;
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw bad;
    if (!user.isActive) throw new ApiError('AUTH_USER_INACTIVE');

    const accessToken = this.jwt.signAccess(user.id, user.role);
    const refreshToken = await this.refreshTokens.issue(user.id, user.role);
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = this.jwt.verify(refreshToken);
    } catch {
      throw new ApiError('AUTH_REFRESH_INVALID');
    }
    if (payload.type !== 'refresh') throw new ApiError('AUTH_REFRESH_INVALID');

    const alive = await this.refreshTokens.verify(refreshToken);
    if (!alive) throw new ApiError('AUTH_REFRESH_INVALID');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new ApiError('AUTH_REFRESH_INVALID');

    const accessToken = this.jwt.signAccess(user.id, user.role);
    return { accessToken, user: this.publicUser(user) };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);
    return { ok: true };
  }

  publicUser(user: { id: number; email: string; fullName: string; phone: string | null; role: string; locale: string; isActive: boolean }) {
    return {
      id: user.id, email: user.email, fullName: user.fullName,
      phone: user.phone, role: user.role, locale: user.locale, isActive: user.isActive,
    };
  }
}
