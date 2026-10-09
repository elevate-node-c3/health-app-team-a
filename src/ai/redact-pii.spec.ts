import { describe, it, expect } from '@jest/globals';

import { redactPii } from './ai.safety';

describe('redactPii', () => {
  it('redacts bearer tokens', () => {
    expect(
      redactPii(
        'Here is my token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      ),
    ).toBe('Here is my token: [REDACTED TOKEN]');
  });

  it('redacts credit card numbers', () => {
    expect(redactPii('My card is 4111 1111 1111 1111')).toBe(
      'My card is [REDACTED CARD]',
    );
    expect(redactPii('My card is 4111-1111-1111-1111')).toBe(
      'My card is [REDACTED CARD]',
    );
  });

  it('redacts passwords', () => {
    expect(redactPii('My password is: secret123')).toBe(
      'My password: [REDACTED]',
    );
    expect(redactPii('password=supersecret')).toBe('password: [REDACTED]');
  });

  it('redacts email addresses', () => {
    expect(redactPii('Email me at patient@example.com please')).toBe(
      'Email me at [REDACTED EMAIL] please',
    );
  });
});
