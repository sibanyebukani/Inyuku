type HeaderValue = string | string[] | undefined;
type Headers = Record<string, HeaderValue>;

function readHeader(headers: Headers, key: string): string | undefined {
  const v = headers[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Extracts the originating client IP from a generic header bag.
 * Works for both Fastify req.headers and a plain object built from Next.js headers().
 *
 * Order: x-forwarded-for (first hop) -> x-real-ip -> fallback -> null.
 */
export function getClientIpFromHeaders(headers: Headers, fallback?: string): string | null {
  const xff = readHeader(headers, 'x-forwarded-for');
  if (xff && xff.trim().length > 0) {
    return xff.split(',')[0]!.trim();
  }
  const xri = readHeader(headers, 'x-real-ip');
  if (xri && xri.trim().length > 0) {
    return xri.trim();
  }
  return fallback ?? null;
}
