// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import MerchantLayout from './layout';
import { useConversationStore } from '@/lib/whatsapp/store';
import { logout } from '@/lib/auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/orders',
}));

vi.mock('@/lib/auth', () => ({
  logout: vi.fn(),
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

function desktopNav() {
  return within(screen.getByRole('navigation', { name: 'Merchant' }));
}

describe('MerchantLayout', () => {
  beforeEach(() => {
    useConversationStore.setState({ conversations: [], stale: false, loading: false, loaded: false, lastFetchedAt: null });
    push.mockClear();
    vi.mocked(logout).mockReset();
  });

  it('renders nav links including WhatsApp and highlights the active route', () => {
    render(
      <MerchantLayout>
        <div data-testid="page">Page</div>
      </MerchantLayout>,
    );

    for (const label of ['Dashboard', 'Products', 'Orders', 'WhatsApp', 'Customers', 'Inventory', 'Onboarding']) {
      expect(desktopNav().getByRole('link', { name: label })).toBeInTheDocument();
    }

    const ordersLink = desktopNav().getByRole('link', { name: 'Orders' });
    expect(ordersLink).toHaveAttribute('aria-current', 'page');
    expect(desktopNav().getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
  });

  it('places WhatsApp between Orders and Customers', () => {
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const labels = desktopNav().getAllByRole('link').map((l) => l.textContent?.trim());
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
    expect(desktopNav().getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();

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
    expect(desktopNav().getByRole('link', { name: /WhatsApp.*1 waiting for reply/i })).toBeInTheDocument();
  });

  it('persists the sidebar collapse toggle to localStorage', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    localStorage.clear();
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem('inyuku_merchant_sidebar_expanded')).toBe('false');
  });

  it('toggles the dark class on <html> and persists it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const toggles = screen.getAllByRole('button', { name: /switch to dark mode/i });
    await userEvent.click(toggles[0]);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('inyuku_merchant_dark_mode')).toBe('true');
  });

  it('opens the mobile menu sheet on hamburger click and closes it on backdrop click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(screen.queryByRole('navigation', { name: 'Merchant menu' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('navigation', { name: 'Merchant menu' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Merchant menu' })).not.toBeInTheDocument();
    });
  });

  it('still redirects to /login when logout() rejects (offline)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    vi.mocked(logout).mockRejectedValueOnce(new Error('Network error'));
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const trigger = screen.getByText('e').closest('button');
    expect(trigger).toBeTruthy();
    await userEvent.click(trigger!);
    await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/login');
    });
  });
});
