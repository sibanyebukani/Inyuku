// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentToggle } from './PaymentToggle';
import { useOrderStore } from '@/lib/orders/store';

describe('PaymentToggle', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the current state and is disabled without order:write', () => {
    render(<PaymentToggle clientId="o1" businessId="biz1" currentState="UNPAID" canWrite={false} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/unpaid/i);
  });

  it('optimistically flips to PAID and calls setPayment', async () => {
    const setPayment = vi.spyOn(useOrderStore.getState(), 'setPayment').mockResolvedValue();
    const onToggle = vi.fn();
    render(
      <PaymentToggle clientId="o1" businessId="biz1" currentState="UNPAID" canWrite onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent(/paid/i);
    await waitFor(() => expect(setPayment).toHaveBeenCalledWith('o1', 'biz1', 'PAID'));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith('PAID'));
  });

  it('rolls back the optimistic state on error', async () => {
    vi.spyOn(useOrderStore.getState(), 'setPayment').mockRejectedValue(new Error('offline'));
    render(<PaymentToggle clientId="o1" businessId="biz1" currentState="PAID" canWrite />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent(/paid/i));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
