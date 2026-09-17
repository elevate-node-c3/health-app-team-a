import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { AuthenticationGuard } from '../guards/authentication.guard';

export const IS_REFRESH_ROUTE_KEY = 'isRefreshRoute';

export const Auth = () => {
  return applyDecorators(UseGuards(AuthenticationGuard));
};

export const RefreshAuth = () => {
  return applyDecorators(
    SetMetadata(IS_REFRESH_ROUTE_KEY, true),
    UseGuards(AuthenticationGuard),
  );
};
