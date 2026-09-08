import { resolve } from 'path';

import { config } from 'dotenv';
import { CookieOptions } from 'express';

config({
  path: resolve(__dirname, `../.env.`),
});
export const COOKIE_OPTION: CookieOptions = {
  maxAge: 15 * 60 * 1000,
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export const REFRESH_COOKIE_OPTION: CookieOptions = {
  ...COOKIE_OPTION,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/auth',
};
