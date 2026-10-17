import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express-serve-static-core';
import { AuthService } from './auth.service';
import { JwtAuthGuard, Roles } from './guards';
import { ChangePasswordDto, UpdateProfileDto } from './auth.dto';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile' })
  async me(@Req() req: AuthedRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user!.id } });
    return this.auth.publicUser(user!);
  }

  @Patch()
  @ApiOperation({ summary: 'Update own fullName / phone / locale (e-mail and role immutable)' })
  async update(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    const data: UpdateProfileDto = {};
    if (dto.fullName !== undefined) {
      if (dto.fullName.length < 2 || dto.fullName.length > 80) {
        throw new ApiError('VALIDATION_ERROR', { field: 'fullName', reason: 'length must be 2-80' });
      }
      data.fullName = dto.fullName;
    }
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.locale !== undefined) {
      if (dto.locale !== 'hu' && dto.locale !== 'en') {
        throw new ApiError('VALIDATION_ERROR', { field: 'locale', reason: 'must be hu or en' });
      }
      data.locale = dto.locale;
    }
    const user = await this.prisma.user.update({ where: { id: req.user!.id }, data });
    return this.auth.publicUser(user);
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change password with current-password confirmation' })
  async changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user!.id } });
    const ok = user && (await bcrypt.compare(dto.currentPassword, user.passwordHash));
    if (!ok) throw new ApiError('AUTH_OLD_PASSWORD_MISMATCH');
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);
    await this.prisma.user.update({
      where: { id: user!.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, rounds) },
    });
    return { ok: true };
  }
}

// Example of a role-protected endpoint for E2-S7 verification without new
// controllers in later epics hijacking this file.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('ping')
  @Roles('ADMIN')
  async ping() {
    return { ok: true, users: await this.prisma.user.count() };
  }
}
