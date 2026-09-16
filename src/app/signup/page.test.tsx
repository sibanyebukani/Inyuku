// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignupPage from './page';
import * as auth from '@/lib/auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('SignupPage', () => {
  beforeEach(() => {
    push.mockClear();
    vi.restoreAllMocks();
  });

  it('submits the form and redirects to the dashboard on success', async () => {
    vi.spyOn(auth, 'signup').mockResolvedValue({
      user: { id: 'u', email: 'a@b.com', name: 'Nomsa', phone: null, status: 'ACTIVE' },
      business: { id: 'biz1', name: 'Nomsa Spaza', slug: 'nomsa-spaza' },
      membership: { id: 'm1', role: 'MERCHANT_OWNER' },
    });
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByLabelText(/accept the terms/i));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(auth.signup).toHaveBeenCalledWith({
      businessName: 'Nomsa Spaza',
      name: 'Nomsa',
      email: 'a@b.com',
      password: 'password123',
      phone: undefined,
      acceptTerms: true,
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('requires the terms checkbox before submitting', async () => {
    vi.spyOn(auth, 'signup');
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(auth.signup).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/accept the terms/i);
  });

  it('shows a plain-language error on a failed signup', async () => {
    vi.spyOn(auth, 'signup').mockRejectedValue(new Error('Email already in use'));
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByLabelText(/accept the terms/i));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
  });
});
