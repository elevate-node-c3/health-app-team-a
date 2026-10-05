import { CookieOptions } from 'express';

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

// Persists an anonymous identity for any guest, not just search, so guest
// activity (search history today, possibly more later) can be tied to one
// visitor across requests. Assigned centrally by `AuthenticationGuard`.
export const DEVICE_ID_COOKIE = 'deviceId';
export const DEVICE_ID_COOKIE_OPTION: CookieOptions = {
  ...COOKIE_OPTION,
  maxAge: 365 * 24 * 60 * 60 * 1000,
  path: '/',
};
