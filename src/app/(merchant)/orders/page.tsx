'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrderStore } from '@/lib/orders/store';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { OrderForm } from './OrderForm';

function formatSast(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
}

export default function OrdersPage() {
  const router = useRouter();
  const items = useOrderStore((s) => s.items);
  const load = useOrderStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Record a sale</h2>
        <OrderForm onDone={(clientId) => router.push(`/orders/${clientId}`)} />
      </div>
      <ul className="divide-y rounded border">
        {items.map((order) => (
          <li key={order.clientId} className="flex items-center justify-between px-4 py-3">
            <Link href={`/orders/${order.clientId}`} className="flex-1">
              <p className="font-medium">
                {order.orderNumber ? `#${order.orderNumber}` : 'New order'} — {centsToZAR(order.totalCents)}
              </p>
              <p className="text-sm text-gray-600">
                {formatSast(order.occurredAt)} · {order.status} · {order.paymentState}
              </p>
              <p className="text-sm text-gray-600">{order.lines.length} item(s)</p>
            </Link>
            <SyncBadge state={order._syncState} />
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No orders yet</li>}
      </ul>
    </div>
  );
}
