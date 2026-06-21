'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCustomerStore } from '@/lib/customers/store';
import { useSession } from '@/lib/session/SessionProvider';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { CustomerForm } from './CustomerForm';
import type { CustomerRow } from '@/lib/offline/types';

export default function CustomersPage() {
  const { hasPerm } = useSession();
  const items = useCustomerStore((s) => s.items);
  const load = useCustomerStore((s) => s.load);
  const canWrite = hasPerm('customer:write');

  const [editing, setEditing] = useState<CustomerRow | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Customers</h1>
      {canWrite && (
        <div className="rounded border p-4">
          <h2 className="mb-3 text-lg font-medium">{editing ? 'Edit customer' : 'Add customer'}</h2>
          <CustomerForm
            key={editing?.clientId ?? 'create'}
            row={editing ?? undefined}
            onDone={() => setEditing(null)}
          />
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="mt-3 text-sm text-gray-600 underline"
            >
              Cancel edit
            </button>
          )}
        </div>
      )}
      <ul className="divide-y rounded border">
        {items.map((c) => (
          <li key={c.clientId} className="flex items-center justify-between px-4 py-3">
            <Link href={`/customers/${c.clientId}`} className="block flex-1">
              <p className="font-medium">{c.name}</p>
              {c.phone && <p className="text-sm text-gray-600">{c.phone}</p>}
              {c.email && <p className="text-sm text-gray-600">{c.email}</p>}
            </Link>
            <div className="flex items-center gap-3">
              <SyncBadge state={c._syncState} />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="rounded border px-2 py-1 text-sm"
                >
                  Edit
                </button>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No customers yet</li>}
      </ul>
    </div>
  );
}
