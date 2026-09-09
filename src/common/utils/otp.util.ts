import { randomInt } from 'crypto';

export function generateOtp(length = 4): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return randomInt(min, max + 1).toString();
}
