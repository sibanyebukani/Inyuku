// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useOnboardingStore,
  hasSkippedOnboarding,
  clearOnboardingSkip,
} from './store';
import * as authMod from '@/lib/session/authFetch';
import * as productMod from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';

describe('useOnboardingStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    clearOnboardingSkip();
    useOnboardingStore.setState({
      step: 'profile',
      businessName: '',
      productClientId: null,
      error: null,
    });
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOnboardingSkip();
  });

  it('completeProfile patches the business and advances to the product step', async () => {
    const authSpy = vi.spyOn(authMod, 'authFetch').mockResolvedValue({ business: { name: 'Nomsa Store' } });
    await useOnboardingStore.getState().completeProfile('biz1', 'Nomsa Store');
    expect(authSpy).toHaveBeenCalledWith('/v1/businesses/biz1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Nomsa Store' }),
    });
    expect(useOnboardingStore.getState().step).toBe('product');
    expect(useOnboardingStore.getState().businessName).toBe('Nomsa Store');
  });

  it('createFirstProduct calls the product store with opening stock and finishes', async () => {
    const createSpy = vi
      .spyOn(productMod.useProductStore.getState(), 'create')
      .mockResolvedValue('prod-cid');
    const clientId = await useOnboardingStore.getState().createFirstProduct({
      name: 'Bread',
      sellPriceCents: 1500,
      openingStock: 20,
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread', sellPriceCents: 1500, openingStock: 20 }),
    );
    expect(clientId).toBe('prod-cid');
    expect(useOnboardingStore.getState().step).toBe('done');
    expect(useOnboardingStore.getState().productClientId).toBe('prod-cid');
  });

  it('skip persists a flag in localStorage and finishes', () => {
    useOnboardingStore.getState().skip();
    expect(hasSkippedOnboarding()).toBe(true);
    expect(useOnboardingStore.getState().step).toBe('done');
  });
});
