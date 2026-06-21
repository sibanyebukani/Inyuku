import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects a missing/invalid email with 422', async () => {
    const res = await POST(req({ name: 'A' }))
    expect(res.status).toBe(422)
  })

  it('proxies a contact lead to /v1/leads', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ ok: true, data: { id: 'lead_123', status: 'NEW' } }),
    })

    const res = await POST(req({ source: 'contact', name: 'A', email: 'a@b.co.za', message: 'hello' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ ok: true, data: { id: 'lead_123', status: 'NEW' } })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/leads',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"source":"contact"'),
      }),
    )
  })

  it('proxies an impact_report lead', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ ok: true, data: { id: 'lead_456', status: 'NEW' } }),
    })

    const res = await POST(req({ source: 'impact_report', email: 'impact@b.co.za' }))
    expect(res.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/leads',
      expect.objectContaining({
        body: expect.stringContaining('"source":"impact_report"'),
      }),
    )
  })

  it('returns backend error envelope on upstream failure', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({
      status: 429,
      json: async () => ({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' } }),
    })

    const res = await POST(req({ source: 'contact', email: 'a@b.co.za', message: 'hi' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED' } })
  })
})
