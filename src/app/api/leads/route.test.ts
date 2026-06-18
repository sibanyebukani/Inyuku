import { describe, it, expect } from 'vitest'
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
  it('rejects a missing/invalid email with 422', async () => {
    const res = await POST(req({ name: 'A' }))
    expect(res.status).toBe(422)
  })
  it('accepts a valid email but reports backend-not-wired (503) until M1', async () => {
    const res = await POST(req({ email: 'merchant@example.co.za', source: 'contact' }))
    expect(res.status).toBe(503)
  })
})
