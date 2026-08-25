import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenModel } from './entities/refresh-token.model';
import { UserModel } from './entities/user.model';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { AdminGuard } from './admin.guard';
import { OAuthIdentityModel } from './entities/oauth-identity.model';
import { OAuthVerifiedGuard } from './oauth-verified.guard';

/**
 * Global so any feature module can `@UseGuards(JwtAuthGuard)` without importing
 * AuthModule first.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([UserModel, RefreshTokenModel, OAuthIdentityModel]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');

        // Fail at boot, not at first login. A default secret in production means
        // anyone can mint a token for any user.
        if (!secret || secret.length < 32) {
          throw new Error(
            'JWT_SECRET must be set to at least 32 characters. Generate one with:\n' +
              "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
          );
        }

        return { secret, signOptions: { issuer: 'ratroo-api' }, verifyOptions: { issuer: 'ratroo-api' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, JwtAuthGuard, OAuthVerifiedGuard, AdminGuard],
  // SequelizeModule is re-exported so the repository tokens travel with the
  // guards. A guard referenced as a class in `@UseGuards` is constructed in the
  // *controller's* module, not the one that declared it — so exporting
  // OAuthVerifiedGuard alone left OperatorsModule unable to resolve
  // OAuthIdentityModelRepository, and the whole application failed to boot.
  exports: [AuthService, JwtAuthGuard, OAuthVerifiedGuard, AdminGuard, JwtModule, SequelizeModule],
})
export class AuthModule {}
