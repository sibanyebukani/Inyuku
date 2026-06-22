'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInventoryStore } from '@/lib/inventory/store';
import { useProductStore } from '@/lib/products/store';
import { useSession } from '@/lib/session/SessionProvider';
import { useOnline } from '@/lib/offline/useOnline';
import { authFetch } from '@/lib/session/authFetch';
import { SyncBadge } from '@/lib/products/SyncBadge';
import {
  stockAdjustmentSchema,
  type StockAdjustmentFormValues,
} from '@/lib/inventory/schema';
import type { ProductRow, StockMovementRow } from '@/lib/offline/types';

interface StockSnapshot {
  level: number;
  stale: boolean;
}

const TYPE_LABEL: Record<StockMovementRow['type'], string> = {
  OPENING: 'Opening',
  ADJUSTMENT: 'Adjustment',
  SALE: 'Sale',
  SALE_REVERSAL: 'Sale reversal',
  RECEIVE: 'Receive',
};

export default function InventoryPage() {
  const { activeBusinessId } = useSession();
  const online = useOnline();

  const products = useProductStore((s) => s.items);
  const loadProducts = useProductStore((s) => s.load);
  const movements = useInventoryStore((s) => s.items);
  const loadMovements = useInventoryStore((s) => s.load);
  const adjust = useInventoryStore((s) => s.adjust);

  const [stockMap, setStockMap] = useState<Record<string, StockSnapshot>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeProducts = useMemo(
    () => products.filter((p) => p.status === 'ACTIVE'),
    [products],
  );

  const productByClientId = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const p of products) map.set(p.clientId, p);
    return map;
  }, [products]);

  useEffect(() => {
    void loadProducts();
    void loadMovements();
  }, [loadProducts, loadMovements]);

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
      for (const p of activeProducts) {
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
    return () => {
      cancelled = true;
    };
  }, [activeProducts, online, activeBusinessId]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentFormValues>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      productId: '',
      type: 'ADJUSTMENT',
      qty: '',
      reason: '',
    },
  });

  const selectedType = watch('type');

  async function onSubmit(values: StockAdjustmentFormValues) {
    setSubmitError(null);
    try {
      await adjust({
        productId: values.productId,
        type: values.type,
        qtyDelta: Number(values.qty),
        reason: values.reason || undefined,
      });
      reset({ productId: '', type: 'ADJUSTMENT', qty: '', reason: '' });
    } catch {
      setSubmitError('Could not save the adjustment. Please try again.');
    }
  }

  function productName(clientId: string): string {
    return productByClientId.get(clientId)?.name ?? 'Unknown product';
  }

  function formatQty(qty: number): string {
    return qty > 0 ? `+${qty}` : String(qty);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Inventory</h1>

      <div className="rounded border p-4">
        <h2 className="mb-3 text-lg font-medium">Record stock adjustment</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="productId" className="block text-sm font-medium">
              Product
            </label>
            <select
              id="productId"
              {...register('productId')}
              className="mt-1 w-full rounded border bg-white px-3 py-2"
            >
              <option value="">Select a product</option>
              {activeProducts.map((p) => (
                <option key={p.clientId} value={p.clientId}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="text-sm text-red-600">{errors.productId.message}</p>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium">Type</span>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="ADJUSTMENT"
                  {...register('type')}
                />
                Adjustment (use − for down)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="RECEIVE" {...register('type')} />
                Receive
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="qty" className="block text-sm font-medium">
              Quantity
            </label>
            <input
              id="qty"
              inputMode="numeric"
              {...register('qty')}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder={selectedType === 'RECEIVE' ? 'e.g. 10' : 'e.g. -5 or 3'}
            />
            {errors.qty && (
              <p className="text-sm text-red-600">{errors.qty.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium">
              Reason
              {selectedType === 'RECEIVE' && (
                <span className="font-normal text-gray-500"> (optional)</span>
              )}
            </label>
            <input
              id="reason"
              {...register('reason')}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder={
                selectedType === 'ADJUSTMENT'
                  ? 'e.g. damaged stock'
                  : 'e.g. supplier delivery'
              }
            />
            {errors.reason && (
              <p className="text-sm text-red-600">{errors.reason.message}</p>
            )}
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
          >
            Save adjustment
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Current stock</h2>
        {!online && Object.keys(stockMap).length === 0 && (
          <p className="text-sm text-gray-500">
            Stock levels are unavailable while offline.
          </p>
        )}
        <ul className="divide-y rounded border">
          {activeProducts.map((p) => {
            const stock = stockMap[p.clientId];
            const isNegative = stock != null && stock.level < 0;
            return (
              <li key={p.clientId} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  {stock ? (
                    <span
                      className={`text-sm ${
                        isNegative
                          ? 'font-semibold text-red-700'
                          : 'text-gray-600'
                      }`}
                    >
                      {formatQty(stock.level)} in stock
                      {stock.stale && ' (last known, offline)'}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
                {isNegative && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    Negative stock — review recent movements
                  </p>
                )}
              </li>
            );
          })}
          {activeProducts.length === 0 && (
            <li className="px-4 py-6 text-center text-gray-500">
              No active products to track stock for
            </li>
          )}
        </ul>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Recent movements</h2>
        <ul className="divide-y rounded border">
          {[...movements]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((m) => (
              <li
                key={m.clientId}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium">{productName(m.productId)}</p>
                  <p className="text-sm text-gray-600">
                    {TYPE_LABEL[m.type]} ·{' '}
                    <span
                      className={`font-medium ${
                        m.qtyDelta < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatQty(m.qtyDelta)}
                    </span>
                    {m.reason && <span className="ml-2">· {m.reason}</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(m.occurredAt).toLocaleString('en-ZA')}
                  </p>
                </div>
                <SyncBadge state={m._syncState} />
              </li>
            ))}
          {movements.length === 0 && (
            <li className="px-4 py-6 text-center text-gray-500">
              No stock movements yet
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
