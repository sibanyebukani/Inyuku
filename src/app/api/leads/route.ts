import { NextRequest, NextResponse } from 'next/server';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'BAD_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!email || !emailRe.test(email)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_EMAIL', message: 'A valid email is required' } },
      { status: 422 },
    );
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBase) {
    return NextResponse.json(
      { ok: false, error: { code: 'BACKEND_NOT_WIRED', message: 'NEXT_PUBLIC_API_BASE_URL is not set' } },
      { status: 503 },
    );
  }

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, consentGiven: true }),
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json(
    data ?? { ok: false, error: { code: 'UPSTREAM', message: 'Lead service error' } },
    { status: res.status },
  );
}
