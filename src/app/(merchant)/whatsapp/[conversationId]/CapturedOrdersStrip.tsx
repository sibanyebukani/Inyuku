'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useOrderStore } from '@/lib/orders/store';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { PaymentToggle } from '@/components/PaymentToggle';
import { copy } from '@/lib/whatsapp/copy';

interface CapturedOrdersStripProps {
  conversationId: string;
  businessId: string;
  canWrite: boolean;
  /** Offered when an order is marked PAID — optional notify-send (S6/AC2). */
  onNotifyPaid?: (orderTotalCents: number) => Promise<void>;
}

export function CapturedOrdersStrip({
  conversationId,
  businessId,
  canWrite,
  onNotifyPaid,
}: CapturedOrdersStripProps) {
  const items = useOrderStore((s) => s.items);
  const load = useOrderStore((s) => s.load);
  const [notify, setNotify] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const captured = items.filter((o) => o.conversationId === conversationId);
  if (captured.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-gray-700">{copy.order.captured}</h2>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        {copy.order.notify}
      </label>
      <ul className="divide-y rounded border">
        {captured.map((order) => (
          <li key={order.clientId} className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href={`/orders/${order.clientId}`} className="min-w-0 flex-1">
              <p className="font-medium">
                {order.orderNumber ? `#${order.orderNumber}` : copy.order.captured} —{' '}
                {centsToZAR(order.totalCents)}
              </p>
              <p className="text-sm text-gray-600">{order.lines.length} item(s)</p>
            </Link>
            <div className="flex items-center gap-2">
              <PaymentToggle
                clientId={order.clientId}
                businessId={businessId}
                currentState={order.paymentState}
                canWrite={canWrite}
                onToggle={(next) => {
                  if (next === 'PAID' && notify && onNotifyPaid) void onNotifyPaid(order.totalCents);
                }}
              />
              <SyncBadge state={order._syncState} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
