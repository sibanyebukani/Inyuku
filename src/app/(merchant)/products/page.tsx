'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProductStore } from '@/lib/products/store';
import { useSession } from '@/lib/session/SessionProvider';
import { useOnline } from '@/lib/offline/useOnline';
import { authFetch } from '@/lib/session/authFetch';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { ProductForm } from './ProductForm';
import type { ProductRow } from '@/lib/offline/types';

interface StockSnapshot {
  level: number;
  stale: boolean;
}

export default function ProductsPage() {
  const { hasPerm, activeBusinessId } = useSession();
  const online = useOnline();
  const items = useProductStore((s) => s.items);
  const load = useProductStore((s) => s.load);
  const archive = useProductStore((s) => s.archive);
  const canSeeCost = hasPerm('catalog:read_cost');

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockSnapshot>>({});

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => items.filter((p) => p.status === 'ACTIVE'), [items]);

  useEffect(() => {
    if (!online) {
      setStockMap((prev) => {
        const next: Record<string, StockSnapshot> = {};
        for (const key of Object.keys(prev)) {
          next[key] = { ...prev[key], stale: true };
        }
        return next;
      });
      return;
    }

    let cancelled = false;
    async function fetchStock() {
      const next: Record<string, StockSnapshot> = {};
      for (const p of active) {
        if (!p.serverId) continue;
        try {
          const { stockLevel } = await authFetch<{ stockLevel: number }>(
            `/v1/businesses/${activeBusinessId}/products/${p.serverId}/stock`,
          );
          next[p.clientId] = { level: stockLevel, stale: false };
        } catch {
          // Leave unset on error; the next successful fetch will refresh it.
        }
      }
      if (!cancelled) setStockMap(next);
    }
    void fetchStock();
    return () => { cancelled = true; };
  }, [active, online, activeBusinessId]);

  function isLowStock(p: ProductRow): boolean {
    const threshold = p.lowStockThreshold;
    if (threshold == null) return false;
    const stock = stockMap[p.clientId];
    if (!stock) return false;
    return stock.level <= threshold;
  }

  function handleArchive(p: ProductRow) {
    if (window.confirm(`Archive "${p.name}"? It will no longer appear in the active list.`)) {
      void archive(p.clientId);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>
      <div className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">{editing ? 'Edit product' : 'Add product'}</h2>
        <ProductForm key={editing?.clientId ?? 'create'} row={editing ?? undefined} onDone={() => setEditing(null)} />
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
              {p.imageUrl && <p className="text-xs text-gray-500">Image uploaded</p>}
              {isLowStock(p) && (
                <p className="text-xs font-semibold text-amber-700">
                  Low stock ({stockMap[p.clientId].stale ? 'last known ' : ''}{stockMap[p.clientId].level} left)
                </p>
              )}
              {!online && stockMap[p.clientId] && (
                <p className="text-xs text-gray-500">Stock last-known (offline)</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <SyncBadge state={p._syncState} />
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="rounded border px-2 py-1 text-sm"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleArchive(p)}
                className="rounded border px-2 py-1 text-sm text-red-700"
              >
                Archive
              </button>
            </div>
          </li>
        ))}
        {active.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No products yet</li>}
      </ul>
    </div>
  );
}
