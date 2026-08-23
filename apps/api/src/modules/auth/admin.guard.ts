import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Second gate for the standalone moderation website.
 *
 * Authentication remains JWT based. Admin authority is supplied only through
 * deployment configuration, so no admin address or secret is shipped in either
 * frontend bundle. JwtAuthGuard must run before this guard.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const email = request.user?.email.trim().toLowerCase();
    const allowed = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);

    if (!email || !allowed.includes(email)) {
      throw new ForbiddenException('This account is not allowed to review Ratroo submissions.');
    }

    return true;
  }
}
