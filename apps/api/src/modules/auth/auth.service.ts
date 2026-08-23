import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import { createHash, randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { AuthTokensDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshTokenModel } from './entities/refresh-token.model';
import { UserModel } from './entities/user.model';
import { PasswordService } from './password.service';
import { OAuthIdentityModel } from './entities/oauth-identity.model';

/** Payload carried inside the access token. Keep it small — it is not encrypted. */
export interface JwtPayload {
  sub: string;
  email: string;
}

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS || 15 * 60);
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(UserModel) private readonly users: typeof UserModel,
    @InjectModel(RefreshTokenModel) private readonly refreshTokens: typeof RefreshTokenModel,
    @InjectModel(OAuthIdentityModel) private readonly oauthIdentities: typeof OAuthIdentityModel,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    const email = this.normalizeEmail(dto.email);

    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException('An account with that email already exists.');
    }

    const user = await this.users.create({
      email,
      passwordHash: await this.passwords.hash(dto.password),
      displayName: dto.displayName,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.users.findOne({ where: { email } });

    // Hash even when the user is missing, so response time doesn't reveal
    // which emails are registered.
    const valid = user
      ? await this.passwords.verify(dto.password, user.passwordHash)
      : await this.passwords.verify(dto.password, DUMMY_HASH).then(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    return this.issueTokens(user);
  }

  async loginWithGoogle(idToken: string): Promise<AuthTokensDto> {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      this.logger.error('GOOGLE_OAUTH_CLIENT_ID is not configured.');
      throw new UnauthorizedException('Google sign-in is not available right now.');
    }

    let profile;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
      profile = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google sign-in could not be verified.');
    }
    if (!profile?.sub || !profile.email || profile.email_verified !== true) {
      throw new UnauthorizedException('Google did not provide a verified email address.');
    }

    const existingIdentity = await this.oauthIdentities.findOne({ where: { provider: 'google', subject: profile.sub } });
    if (existingIdentity) {
      const user = await this.users.findByPk(existingIdentity.userId);
      if (!user) throw new UnauthorizedException('The linked Ratroo account no longer exists.');
      return this.issueTokens(user);
    }

    const email = this.normalizeEmail(profile.email);
    let user = await this.users.findOne({ where: { email } });
    if (!user) {
      user = await this.users.create({
        email,
        displayName: profile.name?.slice(0, 120),
        // OAuth-only accounts cannot use this random password to log in.
        passwordHash: await this.passwords.hash(randomBytes(48).toString('base64url')),
      });
    }

    await this.oauthIdentities.create({ userId: user.id, provider: 'google', subject: profile.sub });
    return this.issueTokens(user);
  }

  /**
   * Rotating refresh: the presented token is revoked and a new one issued.
   *
   * A token that is already revoked means it was replayed — someone kept a copy.
   * We can't tell the thief from the victim, so every session for that user is
   * killed and both must log in again.
   */
  async refresh(presentedToken: string): Promise<AuthTokensDto> {
    const tokenHash = this.hashToken(presentedToken);
    const record = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (record.revokedAt) {
      this.logger.warn(`Refresh token replay detected for user ${record.userId}; revoking all sessions.`);
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token has already been used.');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    const user = await this.users.findByPk(record.userId);

    if (!user) {
      throw new UnauthorizedException('Account no longer exists.');
    }

    await record.update({ revokedAt: new Date() });
    return this.issueTokens(user);
  }

  async logout(presentedToken: string): Promise<{ loggedOut: true }> {
    await this.refreshTokens.update(
      { revokedAt: new Date() },
      { where: { tokenHash: this.hashToken(presentedToken), revokedAt: { [Op.is]: null } } },
    );

    // Always succeeds — an unknown token is already "logged out".
    return { loggedOut: true };
  }

  async findById(id: string) {
    return this.users.findByPk(id);
  }

  private async issueTokens(user: UserModel): Promise<AuthTokensDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    // 256 bits of entropy — an opaque random string, not a JWT. Refresh tokens
    // are looked up in the database, so they gain nothing from being self-describing.
    const refreshToken = randomBytes(32).toString('base64url');

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    });

    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS }),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  private async revokeAllForUser(userId: string) {
    await this.refreshTokens.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: { [Op.is]: null } } },
    );
  }

  /// Plain SHA-256 is right here: the token is already 256 bits of random, so
  /// there is nothing to brute-force and no need for a slow KDF.
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}

/// A real scrypt hash of a random string, used only to burn equivalent CPU on
/// unknown-email logins.
const DUMMY_HASH =
  'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
