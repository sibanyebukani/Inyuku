import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, logout, getMe } from './auth';

describe('auth client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login posts credentials and returns user', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          user: { id: 'u1', email: 'a@b.co.za', name: 'A', phone: null, status: 'ACTIVE' },
          memberships: [],
        },
      }),
    });

    const result = await login({ email: 'a@b.co.za', password: 'Password123!' });
    expect(result.user.email).toBe('a@b.co.za');
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.co.za', password: 'Password123!' }),
      }),
    );
  });

  it('getMe fetches current user', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          user: { id: 'u1', email: 'a@b.co.za', name: 'A', phone: null, status: 'ACTIVE' },
          memberships: [],
        },
      }),
    });

    const result = await getMe();
    expect(result.user.id).toBe('u1');
  });

  it('logout posts to /v1/auth/logout', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    });

    await logout();
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
