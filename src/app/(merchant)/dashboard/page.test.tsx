// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from './page';
import type { DashboardSnapshot } from './types';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import { openDb } from '@/lib/offline/db';

const BIZ_ID = 'biz1';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [{ businessId: BIZ_ID, role: 'MERCHANT_OWNER', permissions: perms }],
    activeBusinessId: BIZ_ID,
    hasPerm: (p: string) => perms.includes(p),
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function seedCache(snapshot: DashboardSnapshot) {
  const db = await openDb();
  await db.put('meta', snapshot, `dashboard:${BIZ_ID}`);
  db.close();
}

async function clearCache() {
  const db = await openDb();
  await db.clear('meta');
  db.close();
}

describe('DashboardPage', () => {
  beforeEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  it('renders dashboard numbers fetched from the backend', async () => {
    mockSession(['dashboard:read', 'dashboard:read_financial']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      ordersTodayCount: 12,
      productCount: 34,
      lowStockCount: 2,
      revenueTodayCents: 125000,
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByTestId('orders-today')).toHaveTextContent('12'));
    expect(screen.getByTestId('product-count')).toHaveTextContent('34');
    expect(screen.getByTestId('low-stock-count')).toHaveTextContent('2');
    expect(screen.getByTestId('revenue-today')).toHaveTextContent('R 1 250.00');
  });

  it('hides the revenue tile for staff without dashboard:read_financial', async () => {
    mockSession(['dashboard:read']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      ordersTodayCount: 5,
      productCount: 10,
      lowStockCount: 1,
      revenueTodayCents: 50000,
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByTestId('orders-today')).toHaveTextContent('5'));
    expect(screen.queryByTestId('revenue-today')).not.toBeInTheDocument();
  });

  it('shows the cached snapshot when offline', async () => {
    mockSession(['dashboard:read', 'dashboard:read_financial']);
    setOnline(false);

    const fetchedAt = '2026-06-21T08:30:00.000Z';
    await seedCache({
      ordersTodayCount: 7,
      productCount: 20,
      lowStockCount: 3,
      revenueTodayCents: 70000,
      fetchedAt,
    });

    const authFetchSpy = vi.spyOn(authMod, 'authFetch');

    await act(async () => {
      render(<DashboardPage />);
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => expect(screen.getByTestId('orders-today')).toHaveTextContent('7'));
    expect(screen.getByTestId('product-count')).toHaveTextContent('20');
    expect(screen.getByTestId('low-stock-count')).toHaveTextContent('3');
    expect(screen.getByTestId('revenue-today')).toHaveTextContent('R 700.00');
    expect(screen.getByTestId('offline-hint')).toBeInTheDocument();
    expect(authFetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the cached snapshot when the backend request fails', async () => {
    mockSession(['dashboard:read', 'dashboard:read_financial']);
    setOnline(true);

    const fetchedAt = '2026-06-21T07:00:00.000Z';
    await seedCache({
      ordersTodayCount: 3,
      productCount: 8,
      lowStockCount: 0,
      revenueTodayCents: 30000,
      fetchedAt,
    });

    vi.spyOn(authMod, 'authFetch').mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByTestId('orders-today')).toHaveTextContent('3'));
    expect(screen.getByTestId('product-count')).toHaveTextContent('8');
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});
