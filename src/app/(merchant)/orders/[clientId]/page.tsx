'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useOrderStore } from '@/lib/orders/store';
import { useOnline } from '@/lib/offline/useOnline';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import type { OrderRow } from '@/lib/offline/types';

function formatSast(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
}

function ActionButton({
  onClick,
  disabled,
  title,
  children,
  variant = 'default',
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}) {
  const base = 'rounded border px-3 py-1 text-sm';
  const color = variant === 'danger' ? ' text-red-700' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base}${color} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const { activeBusinessId, hasPerm } = useSession();
  const online = useOnline();
  const canWrite = hasPerm('order:write');

  const getOrder = useOrderStore((s) => s.get);
  const complete = useOrderStore((s) => s.complete);
  const voidOrder = useOrderStore((s) => s.void);
  const setPayment = useOrderStore((s) => s.setPayment);

  const [order, setOrder] = useState<OrderRow | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const row = await getOrder(clientId);
      if (!cancelled) {
        setOrder(row);
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [clientId, getOrder]);

  async function handleComplete() {
    if (!order) return;
    setError(null);
    try {
      await complete(order.clientId, activeBusinessId);
      setOrder(await getOrder(order.clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete order');
    }
  }

  async function handleVoid() {
    if (!order) return;
    setError(null);
    try {
      await voidOrder(order.clientId, activeBusinessId);
      setOrder(await getOrder(order.clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void order');
    }
  }

  async function handleTogglePayment() {
    if (!order) return;
    setError(null);
    const next = order.paymentState === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      await setPayment(order.clientId, activeBusinessId, next);
      setOrder(await getOrder(order.clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment');
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (!order) return <div className="p-8 text-center text-gray-500">Order not found</div>;

  const nextPaymentLabel = order.paymentState === 'PAID' ? 'Mark unpaid' : 'Mark paid';
  const needsSync = !order.serverId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-sm text-gray-600 underline">Back</button>
        <h1 className="text-2xl font-semibold">
          {order.orderNumber ? `Order #${order.orderNumber}` : 'New order'}
        </h1>
        <SyncBadge state={order._syncState} />
      </div>

      <div className="rounded border p-4">
        <p className="text-sm text-gray-600">{formatSast(order.occurredAt)}</p>
        <p className="text-sm text-gray-600">Status: {order.status}</p>
        <p className="text-sm text-gray-600">Payment: {order.paymentState}</p>
        <p className="text-lg font-semibold">Total: {centsToZAR(order.totalCents)}</p>
      </div>

      <div className="divide-y rounded border">
        {order.lines.map((line, idx) => (
          <div key={idx} className="px-4 py-3">
            <p className="font-medium">{line.nameSnapshot}</p>
            <p className="text-sm text-gray-600">
              {line.qty} × {centsToZAR(line.unitPriceCents)} = {centsToZAR(line.lineTotalCents)}
            </p>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={handleComplete}
            disabled={!online || order.status !== 'DRAFT' || needsSync}
            title={!online ? 'Complete is available online only' : needsSync ? 'Sync the order before completing' : 'Complete order'}
          >
            Complete
          </ActionButton>
          <ActionButton
            onClick={handleVoid}
            disabled={!online || order.status === 'VOID' || needsSync}
            title={!online ? 'Void is available online only' : needsSync ? 'Sync the order before voiding' : 'Void order'}
            variant="danger"
          >
            Void
          </ActionButton>
          <ActionButton
            onClick={handleTogglePayment}
            disabled={!online || needsSync}
            title={!online ? 'Payment update is available online only' : needsSync ? 'Sync the order before updating payment' : nextPaymentLabel}
          >
            {nextPaymentLabel}
          </ActionButton>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
