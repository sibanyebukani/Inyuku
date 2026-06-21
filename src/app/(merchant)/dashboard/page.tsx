'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session/SessionProvider';
import { useOnline } from '@/lib/offline/useOnline';
import { authFetch } from '@/lib/session/authFetch';
import { centsToZAR } from '@/lib/offline/money';
import { openDb } from '@/lib/offline/db';

export interface DashboardSnapshot {
  ordersTodayCount: number;
  productCount: number;
  lowStockCount: number;
  revenueTodayCents?: number;
  fetchedAt: string;
}

function cacheKey(businessId: string): string {
  return `dashboard:${businessId}`;
}

async function loadCached(businessId: string): Promise<DashboardSnapshot | null> {
  const db = await openDb();
  try {
    const raw = await db.get('meta', cacheKey(businessId));
    if (!raw) return null;
    return raw as DashboardSnapshot;
  } finally {
    db.close();
  }
}

async function saveCached(businessId: string, snapshot: DashboardSnapshot): Promise<void> {
  const db = await openDb();
  try {
    await db.put('meta', snapshot, cacheKey(businessId));
  } finally {
    db.close();
  }
}

export default function DashboardPage() {
  const { activeBusinessId, hasPerm } = useSession();
  const online = useOnline();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canSeeRevenue = hasPerm('dashboard:read_financial');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (online) {
          const data = await authFetch<Omit<DashboardSnapshot, 'fetchedAt'>>(
            `/v1/businesses/${activeBusinessId}/dashboard`,
          );
          const next: DashboardSnapshot = { ...data, fetchedAt: new Date().toISOString() };
          await saveCached(activeBusinessId, next);
          if (!cancelled) setSnapshot(next);
        } else {
          const cached = await loadCached(activeBusinessId);
          if (!cancelled) setSnapshot(cached);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
          const cached = await loadCached(activeBusinessId);
          if (!cancelled) setSnapshot(cached);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, online]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!online && snapshot && (
        <p className="text-sm text-gray-600" data-testid="offline-hint">
          Offline — showing the last available snapshot.
        </p>
      )}

      {snapshot ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded border p-4">
              <p className="text-sm text-gray-600">Orders today</p>
              <p className="text-2xl font-semibold" data-testid="orders-today">
                {snapshot.ordersTodayCount}
              </p>
            </div>
            <div className="rounded border p-4">
              <p className="text-sm text-gray-600">Products</p>
              <p className="text-2xl font-semibold" data-testid="product-count">
                {snapshot.productCount}
              </p>
            </div>
            <div className="rounded border p-4">
              <p className="text-sm text-gray-600">Low stock</p>
              <p className="text-2xl font-semibold" data-testid="low-stock-count">
                {snapshot.lowStockCount}
              </p>
            </div>
            {canSeeRevenue && 'revenueTodayCents' in snapshot && (
              <div className="rounded border p-4">
                <p className="text-sm text-gray-600">Revenue today</p>
                <p className="text-2xl font-semibold" data-testid="revenue-today">
                  {centsToZAR(snapshot.revenueTodayCents ?? 0)}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500" data-testid="last-updated">
            Last updated: {new Date(snapshot.fetchedAt).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-gray-500">No dashboard data available.</p>
      )}
    </div>
  );
}
