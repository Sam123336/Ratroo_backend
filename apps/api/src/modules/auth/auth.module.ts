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

/**
 * Global so any feature module can `@UseGuards(JwtAuthGuard)` without importing
 * AuthModule first.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([UserModel, RefreshTokenModel]),
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
  providers: [AuthService, PasswordService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
