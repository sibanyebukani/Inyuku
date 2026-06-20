import { describe, it, expect } from 'vitest';
import { okEnvelope, errorEnvelope } from '../route-helpers.js';
import { AppError } from '../errors.js';
import { encrypt, decrypt, isEncrypted } from '../crypto.js';
import { hashPassword, comparePassword } from '../password.js';
import { maskEmail, maskPII } from '../pii-mask.js';

describe('envelope', () => {
  it('wraps ok and error', () => {
    expect(okEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
    expect(errorEnvelope('X', 'm')).toEqual({ ok: false, error: { code: 'X', message: 'm' } });
  });
});

describe('crypto', () => {
  it('round-trips and marks ciphertext', () => {
    const c = encrypt('secret-value');
    expect(isEncrypted(c)).toBe(true);
    expect(decrypt(c)).toBe('secret-value');
  });
});

describe('password', () => {
  it('hashes (bcrypt-12) and verifies', async () => {
    const h = await hashPassword('Str0ng!pass');
    expect(h).not.toBe('Str0ng!pass');
    expect(await comparePassword('Str0ng!pass', h)).toBe(true);
    expect(await comparePassword('wrong', h)).toBe(false);
  });
});

describe('pii-mask', () => {
  it('masks email', () => {
    expect(maskEmail('a@b.com')).not.toContain('a@b.com');
  });
  it('redacts name-like keys in audit changes', () => {
    const out = maskPII({ name: 'Sibanye Bukani', firstName: 'Sibanye', surname: 'Bukani' });
    expect(out).toEqual({ name: '[REDACTED]', firstName: '[REDACTED]', surname: '[REDACTED]' });
  });
});

describe('errors', () => {
  it('carries code+status', () => {
    const e = new AppError('C', 'm', 418);
    expect([e.code, e.statusCode]).toEqual(['C', 418]);
  });
});
