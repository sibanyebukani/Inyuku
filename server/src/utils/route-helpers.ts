export interface OkEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function okEnvelope<T>(data: T): OkEnvelope<T> {
  return { ok: true, data };
}

export function errorEnvelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}
