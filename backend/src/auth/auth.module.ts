import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ProfileController, AdminProbeController } from './profile.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtAuthGuard } from './guards';

// Global so JwtAuthGuard / Roles are injectable from any other module
// (VenuesModule etc.) without repeating imports.
@Global()
@Module({
  controllers: [AuthController, ProfileController, AdminProbeController],
  providers: [AuthService, JwtService, RefreshTokenService, JwtAuthGuard],
  exports: [JwtService, JwtAuthGuard],
})
export class AuthModule {}
