import { applyDecorators, UseGuards } from '@nestjs/common';

import { AuthenticationGuard } from '../guards/authentication.guard';

export const Auth = () => {
  return applyDecorators(UseGuards(AuthenticationGuard));
};
