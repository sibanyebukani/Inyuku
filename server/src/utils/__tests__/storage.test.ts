import { describe, it, expect } from 'vitest';
import { storageDriver } from '../storage.js';

describe('storage driver', () => {
  it('selects r2 when STORAGE_DRIVER=r2', () => {
    expect(storageDriver()).toBe('r2');
  });

  it('selects local when STORAGE_DRIVER=local', () => {
    const prev = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = 'local';
    try {
      expect(storageDriver()).toBe('local');
    } finally {
      process.env.STORAGE_DRIVER = prev;
    }
  });
});
