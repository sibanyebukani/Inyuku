import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySignature } from '../whatsapp-signature.js';

function sign(body: string | Buffer, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}

describe('whatsapp-signature', () => {
  const secret = 'test-app-secret';
  const body = Buffer.from(JSON.stringify({ entry: [{ id: '123' }] }));

  it('returns true for a valid signature', () => {
    const header = sign(body, secret);
    expect(verifySignature(body, header, secret)).toBe(true);
  });

  it('returns false when the body is tampered', () => {
    const header = sign(body, secret);
    const tampered = Buffer.from(JSON.stringify({ entry: [{ id: '999' }] }));
    expect(verifySignature(tampered, header, secret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const header = sign(body, secret);
    expect(verifySignature(body, header, 'wrong-secret')).toBe(false);
  });

  it('returns false for a missing header', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  it('returns false for a garbage header', () => {
    expect(verifySignature(body, 'not-a-signature', secret)).toBe(false);
    expect(verifySignature(body, 'sha256=zzzz', secret)).toBe(false);
  });

  it('returns false on length mismatch without throwing', () => {
    const header = 'sha256=deadbeef';
    expect(() => verifySignature(body, header, secret)).not.toThrow();
    expect(verifySignature(body, header, secret)).toBe(false);
  });

  it('is constant-time-ish: same result for valid vs invalid of same length', () => {
    const validHeader = sign(body, secret);
    const invalidHeader = `sha256=${createHmac('sha256', 'other-secret').update(body).digest('hex')}`;
    expect(verifySignature(body, validHeader, secret)).toBe(true);
    expect(verifySignature(body, invalidHeader, secret)).toBe(false);
  });
});
