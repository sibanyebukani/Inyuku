import { describe, it, expect } from 'vitest';
import messages from '../messages/en.json';

describe('i18n', () => {
  it('loads English messages with nav keys', () => {
    expect(messages.nav.home).toBe('Home');
    expect(messages.cta.getStarted).toBe('Get Started');
  });

  it('has a stub message file for every supported locale', async () => {
    const locales = ['zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts'];
    for (const loc of locales) {
      const stub = await import(`../messages/${loc}.json`);
      expect(stub.default.nav.home).toBe('Home');
    }
  });
});
