export { RefreshTokenModel } from './refresh-token.model';
export { UserModel } from './user.model';
export { OAuthIdentityModel } from './oauth-identity.model';

import { RefreshTokenModel } from './refresh-token.model';
import { UserModel } from './user.model';
import { OAuthIdentityModel } from './oauth-identity.model';

export const AUTH_SEQUELIZE_MODELS = [UserModel, RefreshTokenModel, OAuthIdentityModel];
