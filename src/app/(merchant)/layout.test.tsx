// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MerchantLayout from './layout';
import { useConversationStore } from '@/lib/whatsapp/store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/orders',
}));

vi.mock('@/lib/offline/useOnline', () => ({ useOnline: () => true }));

vi.mock('@/lib/session/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: () => true,
  }),
}));

vi.mock('@/lib/offline/triggers', () => ({
  registerSyncTriggers: () => () => {},
}));

describe('MerchantLayout', () => {
  beforeEach(() => {
    useConversationStore.setState({ conversations: [], stale: false, loading: false, loaded: false, lastFetchedAt: null });
  });

  it('renders nav links including WhatsApp and highlights the active route', () => {
    render(
      <MerchantLayout>
        <div data-testid="page">Page</div>
      </MerchantLayout>,
    );

    for (const label of ['Dashboard', 'Products', 'Orders', 'WhatsApp', 'Customers', 'Inventory', 'Onboarding']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    const ordersLink = screen.getByRole('link', { name: 'Orders' });
    expect(ordersLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
  });

  it('places WhatsApp between Orders and Customers', () => {
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const labels = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    const orders = labels.indexOf('Orders');
    const whatsapp = labels.indexOf('WhatsApp');
    const customers = labels.indexOf('Customers');
    expect(orders).toBeLessThan(whatsapp);
    expect(whatsapp).toBeLessThan(customers);
  });

  it('hides the unread pill at 0 and shows the count when > 0', () => {
    const { rerender } = render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();

    useConversationStore.setState({
      conversations: [
        {
          id: 'c1', businessId: 'biz1', channelId: 'ch1', customerId: null, waContactId: '27821234567',
          lastInboundAt: '2026-06-21T12:00:00Z', lastOutboundAt: null, status: 'OPEN',
          createdAt: '2026-06-21T08:00:00Z', updatedAt: '2026-06-21T12:00:00Z',
        },
      ],
    });
    rerender(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(screen.getByRole('link', { name: /WhatsApp.*1 waiting for reply/i })).toBeInTheDocument();
  });
});
