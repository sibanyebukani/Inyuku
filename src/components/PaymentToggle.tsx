'use client';

import { useState } from 'react';
import { useOrderStore } from '@/lib/orders/store';
import { copy } from '@/lib/whatsapp/copy';

interface PaymentToggleProps {
  /** Local client id of the order row (the store key). */
  clientId: string;
  businessId: string;
  currentState: 'PAID' | 'UNPAID';
  /** Gates the control — requires the M2 order:write permission. */
  canWrite: boolean;
  /** Notified with the new state after a successful toggle (e.g. to offer a notify-send). */
  onToggle?: (next: 'PAID' | 'UNPAID') => void;
}

/**
 * Two-state PAID/UNPAID control. Optimistically flips the displayed state and
 * calls `useOrderStore.setPayment()` (PATCH …/orders/:id/payment); rolls back on
 * error. No cost/financial data is read or rendered (S6/AC4).
 */
export function PaymentToggle({
  clientId,
  businessId,
  currentState,
  canWrite,
  onToggle,
}: PaymentToggleProps) {
  const setPayment = useOrderStore((s) => s.setPayment);
  const [state, setState] = useState<'PAID' | 'UNPAID'>(currentState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    if (!canWrite || busy) return;
    const next = state === 'PAID' ? 'UNPAID' : 'PAID';
    const prev = state;
    setState(next); // optimistic
    setBusy(true);
    setError(false);
    try {
      await setPayment(clientId, businessId, next);
      onToggle?.(next);
    } catch {
      setState(prev); // rollback
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={!canWrite || busy}
        aria-pressed={state === 'PAID'}
        title={!canWrite ? copy.order.noPayPerm : undefined}
        className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
          state === 'PAID'
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800'
        }`}
      >
        {state === 'PAID' ? copy.order.paid : copy.order.unpaid}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {copy.sendError.default}
        </span>
      )}
    </div>
  );
}
