import { generateOtp } from './otp.util';

describe('generateOtp', () => {
  it('defaults to a 4-digit code', () => {
    const otp = generateOtp();

    expect(otp).toMatch(/^\d{4}$/);
  });

  it('supports a custom length when explicitly requested', () => {
    const otp = generateOtp(4);

    expect(otp).toMatch(/^\d{4}$/);
  });
});
