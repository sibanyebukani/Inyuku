'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signup } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SignupForm {
  businessName: string
  name: string
  email: string
  password: string
  phone: string
  acceptTerms: boolean
}

const EMPTY_FORM: SignupForm = {
  businessName: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  acceptTerms: false,
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState<SignupForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.acceptTerms) {
      setError('Please accept the terms to create your shop.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await signup({
        businessName: form.businessName,
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        acceptTerms: form.acceptTerms,
      })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your shop')
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
            <p className="text-accent-orange text-xs font-medium uppercase tracking-[0.15em] mb-3">Get started</p>
            <h1 className="text-[32px] font-bold text-text-primary dark:text-neutral-100">Create your shop</h1>
          </div>

          <div className="rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="businessName" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Shop name
                </label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => setForm((s) => ({ ...s, businessName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="name" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Your name
                </label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
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
                <label htmlFor="password" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Phone (optional)
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-text-secondary dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(e) => setForm((s) => ({ ...s, acceptTerms: e.target.checked }))}
                  className="mt-0.5"
                />
                I accept the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-orange hover:underline">
                  Terms of Service
                </Link>
              </label>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating your shop…' : 'Create account'}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-text-muted mt-6">
            Already have a shop?{' '}
            <Link href="/login" className="font-medium text-accent-orange hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
