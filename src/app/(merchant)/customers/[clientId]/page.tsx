'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useOnline } from '@/lib/offline/useOnline';
import { authFetch } from '@/lib/session/authFetch';
import { centsToZAR } from '@/lib/offline/money';
import { makeRepo } from '@/lib/offline/repo';
import { SyncBadge } from '@/lib/products/SyncBadge';
import type { CustomerRow, OrderRow } from '@/lib/offline/types';

interface RecentOrder {
  id: string;
  orderNumber?: string;
  status: string;
  totalCents: number;
  occurredAt: string;
}

const customersRepo = makeRepo<CustomerRow>('customers');
const ordersRepo = makeRepo<OrderRow>('orders');

export default function CustomerDetailPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;
  const { activeBusinessId } = useSession();
  const online = useOnline();

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const local = await customersRepo.get(clientId);
      if (!local) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setCustomer(local);

      // Always include locally-known orders that reference this customer.
      const localOrders = (await ordersRepo.list()).filter(
        (o) => o.customerId === local.clientId || (local.serverId && o.customerId === local.serverId),
      );
      const mappedLocal = localOrders.map((o) => ({
        id: o.clientId,
        orderNumber: o.orderNumber,
        status: o.status,
        totalCents: o.totalCents,
        occurredAt: o.occurredAt,
      }));

      if (online && local.serverId) {
        try {
          const envelope = await authFetch<{ customer: Record<string, unknown> & { orders?: RecentOrder[] } }>(
            `/v1/businesses/${activeBusinessId}/customers/${local.serverId}`,
          );
          const server = envelope.customer;
          if (!cancelled) {
            setCustomer((prev) =>
              prev
                ? {
                    ...prev,
                    name: (server.name as string) ?? prev.name,
                    phone: (server.phone as string | undefined) ?? prev.phone,
                    email: (server.email as string | undefined) ?? prev.email,
                    notes: (server.notes as string | undefined) ?? prev.notes,
                    clientId: prev.clientId,
                    serverId: (server.id as string | undefined) ?? prev.serverId,
                    _syncState: 'synced',
                    updatedAtLocal: new Date().toISOString(),
                  }
                : prev,
            );
            setRecentOrders(server.orders ?? []);
          }
        } catch {
          if (!cancelled) setRecentOrders(mappedLocal);
        }
      } else {
        if (!cancelled) setRecentOrders(mappedLocal);
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId, online, activeBusinessId]);

  if (loading) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-gray-500">Customer not found.</p>
        <Link href="/customers" className="text-emerald-600 underline">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <SyncBadge state={customer._syncState} />
      </div>
      <div className="rounded border p-4">
        <dl className="space-y-2">
          {customer.phone && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd>{customer.phone}</dd>
            </div>
          )}
          {customer.email && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd>{customer.email}</dd>
            </div>
          )}
          {customer.notes && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Notes</dt>
              <dd className="whitespace-pre-line">{customer.notes}</dd>
            </div>
          )}
          {!customer.phone && !customer.email && !customer.notes && (
            <p className="text-sm text-gray-500">No contact details saved yet.</p>
          )}
        </dl>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Recent orders</h2>
        {!online && <p className="mb-2 text-sm text-gray-500">Offline — showing locally-known orders</p>}
        {recentOrders.length === 0 && <p className="text-gray-500">No orders recorded.</p>}
        <ul className="divide-y rounded border">
          {recentOrders.map((o) => (
            <li key={o.id} className="px-4 py-3">
              <p className="font-medium">
                Order {o.orderNumber ?? '—'} — {centsToZAR(o.totalCents)}
              </p>
              <p className="text-sm text-gray-600">
                {o.status} · {new Date(o.occurredAt).toLocaleString('en-ZA')}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/customers" className="text-emerald-600 underline">
        Back to customers
      </Link>
    </div>
  );
}
