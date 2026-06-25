import { describe, it, expect } from 'vitest';
import { normalizeMsisdn, maskMsisdn } from '../phone.js';

describe('normalizeMsisdn', () => {
  it('keeps an already-E.164 number', () => {
    expect(normalizeMsisdn('+27821234567')).toBe('+27821234567');
  });
  it('strips spaces and punctuation', () => {
    expect(normalizeMsisdn('+27 (82) 123-4567')).toBe('+27821234567');
  });
  it('adds a + to a bare international number (360dialog waContactId form)', () => {
    expect(normalizeMsisdn('27821234567')).toBe('+27821234567');
  });
  it('expands a ZA local 0-prefixed number to +27', () => {
    expect(normalizeMsisdn('0821234567')).toBe('+27821234567');
  });
});

describe('maskMsisdn', () => {
  it('keeps country code + last 4, masks the middle', () => {
    expect(maskMsisdn('+27821234567')).toBe('+27•••••4567');
  });
  it('masks a short number safely', () => {
    expect(maskMsisdn('1234')).toBe('••••');
  });
});
