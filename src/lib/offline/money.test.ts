import { describe, it, expect } from 'vitest';
import { centsToZAR, zarToCents } from './money';

describe('money', () => {
  it('formats integer cents as ZAR', () => {
    expect(centsToZAR(0)).toBe('R 0.00');
    expect(centsToZAR(1250)).toBe('R 12.50');
    expect(centsToZAR(100000)).toBe('R 1 000.00');
  });

  it('parses ZAR strings to integer cents', () => {
    expect(zarToCents('12.50')).toBe(1250);
    expect(zarToCents('R 12.50')).toBe(1250);
    expect(zarToCents('1 000')).toBe(100000);
    expect(zarToCents('0')).toBe(0);
  });

  it('rejects invalid money input', () => {
    expect(() => zarToCents('abc')).toThrow(RangeError);
    expect(() => zarToCents('12.555')).toThrow(RangeError);
    expect(() => zarToCents('-5')).toThrow(RangeError);
  });

  it('round-trips', () => {
    expect(zarToCents(centsToZAR(98765))).toBe(98765);
  });
});
