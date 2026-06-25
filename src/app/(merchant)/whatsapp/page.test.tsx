// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WhatsAppInboxPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as apiMod from '@/lib/whatsapp/api';
import { useConversationStore } from '@/lib/whatsapp/store';
import type { Conversation } from '@/lib/whatsapp/api';

function mockSession(perms: string[] = ['whatsapp:read']) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

function conv(over: Partial<Conversation>): Conversation {
  return {
    id: 'c1',
    businessId: 'biz1',
    channelId: 'ch1',
    customerId: null,
    waContactId: '27821234567',
    lastInboundAt: null,
    lastOutboundAt: null,
    status: 'OPEN',
    createdAt: '2026-06-21T08:00:00Z',
    updatedAt: '2026-06-21T08:00:00Z',
    ...over,
  };
}

describe('WhatsAppInboxPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSession();
    useConversationStore.setState({ conversations: [], stale: false, loading: false, loaded: false, lastFetchedAt: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders rows with the needs-reply indicator and masked number, no message body', async () => {
    vi.spyOn(apiMod, 'listConversations').mockResolvedValue({
      conversations: [
        conv({ id: 'c1', waContactId: '27821234567', lastInboundAt: '2026-06-21T12:00:00Z', lastOutboundAt: null }),
      ],
      pagination: { page: 1, limit: 50, total: 1 },
    });
    render(<WhatsAppInboxPage />);
    await waitFor(() => expect(screen.getByText(/•••567/)).toBeInTheDocument());
    expect(screen.getByText(/waiting for your reply/i)).toBeInTheDocument();
    // No body text: the payload has none and the row must not invent one.
    expect(screen.queryByText(/secret|hello there/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no conversations', async () => {
    vi.spyOn(apiMod, 'listConversations').mockResolvedValue({
      conversations: [],
      pagination: { page: 1, limit: 50, total: 0 },
    });
    render(<WhatsAppInboxPage />);
    await waitFor(() => expect(screen.getByText(/no chats yet/i)).toBeInTheDocument());
  });

  it('marks the list stale on a fetch error without throwing', async () => {
    vi.spyOn(apiMod, 'listConversations').mockRejectedValue(new Error('offline'));
    render(<WhatsAppInboxPage />);
    await waitFor(() => expect(screen.getByText(/reconnect to update/i)).toBeInTheDocument());
  });

  it('renders identically for a staff (whatsapp:read) session with no cost fields', async () => {
    mockSession(['whatsapp:read']);
    vi.spyOn(apiMod, 'listConversations').mockResolvedValue({
      conversations: [conv({ id: 'c1', lastInboundAt: '2026-06-21T12:00:00Z' })],
      pagination: { page: 1, limit: 50, total: 1 },
    });
    const { container } = render(<WhatsAppInboxPage />);
    await waitFor(() => expect(screen.getByText(/•••567/)).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/cost|margin|R\s?\d/i);
  });
});
