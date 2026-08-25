import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OAuthIdentityModel } from './entities/oauth-identity.model';
import { AuthenticatedUser } from './jwt-auth.guard';

/**
 * Operator submissions affect the public transport graph, so a disposable
 * password-only identity is not enough. The rider must have completed an OAuth
 * identity check. Normal customer/mobile password auth remains untouched.
 */
@Injectable()
export class OAuthVerifiedGuard implements CanActivate {
  constructor(
    @InjectModel(OAuthIdentityModel)
    private readonly identities: typeof OAuthIdentityModel,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.id) throw new ForbiddenException('Authentication is required.');

    const identity = await this.identities.findOne({
      where: { userId: user.id },
      attributes: ['id'],
    });
    if (!identity) {
      throw new ForbiddenException('Connect a verified OAuth account before registering transport.');
    }
    return true;
  }
}
