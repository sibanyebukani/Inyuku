import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, postJson, getJson, ApiError } from './api-client';

describe('api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns data on ok envelope', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, data: { id: 'lead_123' } }),
    });

    const data = await apiFetch('/api/leads');
    expect(data).toEqual({ id: 'lead_123' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/leads',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws ApiError on error envelope', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 429,
      json: async () => ({
        ok: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' },
      }),
    });

    await expect(apiFetch('/api/leads')).rejects.toBeInstanceOf(ApiError);
    try {
      await apiFetch('/api/leads');
    } catch (e) {
      expect((e as ApiError).code).toBe('RATE_LIMIT_EXCEEDED');
      expect((e as ApiError).status).toBe(429);
    }
  });

  it('postJson serializes payload and uses content-type', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ ok: true, data: { id: 'lead_456' } }),
    });

    const data = await postJson('/api/leads', { source: 'contact' });
    expect(data).toEqual({ id: 'lead_456' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/leads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source: 'contact' }),
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('plain object body gets content-type: application/json', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ ok: true, data: {} }),
    });

    await apiFetch('/v1/upload', { method: 'POST', body: JSON.stringify({ foo: 'bar' }) });
    const [, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(calledOpts.headers['content-type']).toBe('application/json');
  });

  it('FormData body does NOT get content-type: application/json set by the client', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    });

    const fd = new FormData();
    fd.append('file', new Blob(['img'], { type: 'image/png' }), 'photo.png');
    await apiFetch('/v1/products/image', { method: 'POST', body: fd });
    const [, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(calledOpts.headers['content-type']).toBeUndefined();
  });

  it('getJson sets GET method', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, data: { user: { id: 'u1' } } }),
    });

    const data = await getJson('/v1/auth/me');
    expect(data).toEqual({ user: { id: 'u1' } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/auth/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
