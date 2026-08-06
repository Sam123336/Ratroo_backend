export { RefreshTokenModel } from './refresh-token.model';
export { UserModel } from './user.model';

import { RefreshTokenModel } from './refresh-token.model';
import { UserModel } from './user.model';

export const AUTH_SEQUELIZE_MODELS = [UserModel, RefreshTokenModel];
