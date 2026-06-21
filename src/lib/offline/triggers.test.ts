// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerSyncTriggers } from './triggers';
import * as sync from './sync';

describe('registerSyncTriggers', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('runs sync on the online event and stops after unsubscribe', async () => {
    const spy = vi.spyOn(sync, 'runSync').mockResolvedValue({ applied: 0, duplicate: 0, conflict: 0, rejected: 0 });
    const unsub = registerSyncTriggers('biz1');
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith('biz1');
    spy.mockClear();
    unsub();
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});
