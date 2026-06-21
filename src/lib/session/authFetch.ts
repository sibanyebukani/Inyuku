import { apiFetch, ApiError } from '@/lib/api-client';

/** apiFetch with a single transparent refresh-and-retry on a 401. */
export async function authFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        await apiFetch('/v1/auth/refresh', { method: 'POST' });
      } catch {
        throw err; // refresh failed — surface the original 401
      }
      return await apiFetch<T>(path, opts);
    }
    throw err;
  }
}
