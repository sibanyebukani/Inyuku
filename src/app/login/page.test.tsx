// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './page'
import * as auth from '@/lib/auth'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear()
    vi.restoreAllMocks()
  })

  it('submits credentials and redirects to the dashboard on success', async () => {
    vi.spyOn(auth, 'login').mockResolvedValue({ user: { id: 'u', email: 'a@b.com', name: 'A', phone: null, status: 'ACTIVE' } })
    vi.spyOn(auth, 'getMe').mockResolvedValue({
      user: { id: 'u', email: 'a@b.com', name: 'A', phone: null, status: 'ACTIVE' },
      memberships: [],
    })
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(auth.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' })
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('shows a plain-language error on failed login', async () => {
    vi.spyOn(auth, 'login').mockRejectedValue(new Error('Invalid credentials'))
    render(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
  })

  it('links to the new signup page', () => {
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/signup')
  })
})
