import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { AuthenticationGuard } from '../guards/authentication.guard';

export const IS_REFRESH_ROUTE_KEY = 'isRefreshRoute';
export const IS_OPTIONAL_AUTH_ROUTE_KEY = 'isOptionalAuthRoute';

export const Auth = () => {
  return applyDecorators(UseGuards(AuthenticationGuard));
};

export const RefreshAuth = () => {
  return applyDecorators(
    SetMetadata(IS_REFRESH_ROUTE_KEY, true),
    UseGuards(AuthenticationGuard),
  );
};

export const OptionalAuth = () => {
  return applyDecorators(
    SetMetadata(IS_OPTIONAL_AUTH_ROUTE_KEY, true),
    UseGuards(AuthenticationGuard),
  );
};
