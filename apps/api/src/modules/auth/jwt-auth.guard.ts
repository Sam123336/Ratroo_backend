import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtPayload } from './auth.service';

/** Mark a route inside a guarded controller as open to anyone. */
export const PUBLIC_KEY = 'isPublic';
export const Public = () => Reflect.metadata(PUBLIC_KEY, true);

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Verifies `Authorization: Bearer <accessToken>`.
 *
 * Opt-in per controller/route (`@UseGuards(JwtAuthGuard)`) rather than global,
 * because the transit read endpoints are deliberately public. To flip the
 * default, register this as an APP_GUARD and mark the public ones `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      // Never echo the JWT library's reason — it distinguishes expired from
      // malformed from bad-signature, which is free information for an attacker.
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  private extractToken(request: Request) {
    const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' ? value : undefined;
  }
}

/** Injects the authenticated user. Only valid on routes behind JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<Request>().user;

    if (!user) {
      throw new UnauthorizedException('Route is not protected by JwtAuthGuard.');
    }

    return user;
  },
);
