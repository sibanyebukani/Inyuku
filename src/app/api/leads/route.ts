import { NextRequest, NextResponse } from 'next/server'

type LeadBody = { name?: string; email?: string; source?: string }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: LeadBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'BAD_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  if (!body.email || !emailRe.test(body.email)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_EMAIL', message: 'A valid email is required' } },
      { status: 422 },
    )
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!apiBase) {
    // M1 wires this to the Express /leads endpoint. Until then, accept-and-acknowledge
    // WITHOUT persisting (Next is not a data store — ADR-001).
    return NextResponse.json(
      { ok: false, error: { code: 'BACKEND_NOT_WIRED', message: 'Lead capture goes live with the M1 backend' } },
      { status: 503 },
    )
  }

  const res = await fetch(`${apiBase}/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: body.name ?? null, email: body.email, source: body.source ?? 'web' }),
  })
  const data = await res.json().catch(() => null)
  return NextResponse.json(data ?? { ok: false, error: { code: 'UPSTREAM', message: 'Lead service error' } }, { status: res.status })
}
