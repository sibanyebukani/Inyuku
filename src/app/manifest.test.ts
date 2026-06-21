import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  it('is installable (standalone, start_url, icons)', () => {
    const m = manifest();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/products');
    expect(m.name).toMatch(/Inyuku/i);
    expect((m.icons ?? []).length).toBeGreaterThan(0);
  });
});
