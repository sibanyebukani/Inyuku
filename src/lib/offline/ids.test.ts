import { describe, it, expect } from 'vitest';
import { newClientId } from './ids';

describe('newClientId', () => {
  it('produces 26-char Crockford-base32 ULIDs', () => {
    const id = newClientId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newClientId()));
    expect(ids.size).toBe(1000);
  });
});
