'use client';

import { useEffect } from 'react';
import { useProductStore } from '@/lib/products/store';
import { useSession } from '@/lib/session/SessionProvider';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { ProductForm } from './ProductForm';

export default function ProductsPage() {
  const { hasPerm } = useSession();
  const items = useProductStore((s) => s.items);
  const load = useProductStore((s) => s.load);
  const canSeeCost = hasPerm('catalog:read_cost');

  useEffect(() => {
    void load();
  }, [load]);

  const active = items.filter((p) => p.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>
      <ProductForm />
      <ul className="divide-y rounded border">
        {active.map((p) => (
          <li key={p.clientId} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-gray-600">
                {centsToZAR(p.sellPriceCents)}
                {canSeeCost && p.costPriceCents != null && (
                  <span className="ml-2 text-gray-400">cost <span>{centsToZAR(p.costPriceCents)}</span></span>
                )}
              </p>
            </div>
            <SyncBadge state={p._syncState} />
          </li>
        ))}
        {active.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No products yet</li>}
      </ul>
    </div>
  );
}
