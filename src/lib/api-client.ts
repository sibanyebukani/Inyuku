export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiResponse<T> {
  ok: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function getUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = API_BASE.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(getUrl(path), {
    ...opts,
    credentials: opts.credentials ?? 'include',
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | ApiErrorEnvelope | null;

  if (body && 'ok' in body && body.ok === true) {
    return body.data;
  }

  const error = body && 'ok' in body && body.ok === false ? body.error : null;
  throw new ApiError(
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'Request failed',
    res.status,
    error?.details,
  );
}

export async function getJson<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, { ...opts, method: 'GET' });
}

export async function postJson<T = unknown>(
  path: string,
  payload: unknown,
  opts: RequestInit = {},
): Promise<T> {
  return apiFetch<T>(path, {
    ...opts,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
