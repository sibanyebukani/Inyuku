'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { login, getMe } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(form)
      await getMe()
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-cream dark:bg-neutral-950">
      <div className="px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="text-[16px] font-bold tracking-tight text-text-primary dark:text-neutral-100">
          Inyuku
        </Link>
        <Link href="/" className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted hover:text-text-primary">
          ← Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <p className="text-accent-orange text-xs font-medium uppercase tracking-[0.15em] mb-3">Welcome back</p>
            <h1 className="text-[32px] font-bold text-text-primary dark:text-neutral-100">Sign in to your shop</h1>
          </div>

          <div className="rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                    Password
                  </label>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-text-muted mt-6">
            Don&apos;t have a shop yet?{' '}
            <Link href="/signup" className="font-medium text-accent-orange hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
