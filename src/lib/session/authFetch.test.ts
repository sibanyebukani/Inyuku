import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch } from './authFetch';
import * as client from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

describe('authFetch', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns data when the first call succeeds', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce({ id: 'x' });
    expect(await authFetch('/v1/foo')).toEqual({ id: 'x' });
  });

  it('on 401 refreshes once then retries successfully', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'expired', 401)); // original
    spy.mockResolvedValueOnce({ ok: true });                         // refresh
    spy.mockResolvedValueOnce({ id: 'y' });                          // retry
    expect(await authFetch('/v1/foo')).toEqual({ id: 'y' });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[1][0]).toBe('/v1/auth/refresh');
  });

  it('rethrows the original 401 when refresh fails', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'expired', 401)); // original
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'no refresh', 401)); // refresh fails
    await expect(authFetch('/v1/foo')).rejects.toMatchObject({ status: 401 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on non-401 errors', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('VALIDATION', 'bad', 400));
    await expect(authFetch('/v1/foo')).rejects.toMatchObject({ status: 400 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
