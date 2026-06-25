'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, getMe } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(form)
      const me = await getMe()
      setUser(me.user)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="w-full max-w-[420px] bg-white rounded-2xl p-8 md:p-10 border border-[#E7E5E4]">
        <h1 className="text-[28px] font-bold text-[#1A1A1A]">Welcome back</h1>
        <p className="mt-2 text-[15px] text-[#78716C]">Sign in to your merchant account.</p>

        {user ? (
          <div className="mt-6 rounded-lg bg-[#2D7A3E]/10 px-4 py-3 text-[#2D7A3E]">
            Signed in as <strong>{user.name}</strong> ({user.email})
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {error && <p role="alert" className="text-[14px] text-red-600">{error}</p>}
            <div>
              <label htmlFor="email" className="block text-[14px] font-medium text-[#1A1A1A] mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[14px] font-medium text-[#1A1A1A] mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-lg text-[15px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#E86A34' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
