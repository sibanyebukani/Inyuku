// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreadPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';

vi.mock('next/navigation', () => ({
  useParams: () => ({ conversationId: 'c1' }),
}));
import * as apiMod from '@/lib/whatsapp/api';
import { ApiError } from '@/lib/api-client';
import { useOrderStore } from '@/lib/orders/store';
import { openDb } from '@/lib/offline/db';
import type { ConversationWithWindow, Message } from '@/lib/whatsapp/api';

function mockSession(perms: string[] = ['whatsapp:read', 'whatsapp:send', 'order:write']) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

function conv(over: Partial<ConversationWithWindow> = {}): ConversationWithWindow {
  return {
    id: 'c1',
    businessId: 'biz1',
    channelId: 'ch1',
    customerId: 'cust1',
    waContactId: '27821234567',
    lastInboundAt: '2026-06-21T12:00:00Z',
    lastOutboundAt: null,
    status: 'OPEN',
    createdAt: '2026-06-21T08:00:00Z',
    updatedAt: '2026-06-21T12:00:00Z',
    windowState: 'OPEN',
    windowExpiresAt: '2026-06-22T12:00:00Z',
    ...over,
  };
}

function msg(over: Partial<Message>): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    direction: 'INBOUND',
    type: 'TEXT',
    body: 'Hello there',
    sendClass: null,
    templateName: null,
    status: 'RECEIVED',
    failureReason: null,
    occurredAt: '2026-06-21T12:00:00Z',
    ...over,
  };
}

function renderThread() {
  return render(<ThreadPage />);
}

describe('ThreadPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockSession();
    const db = await openDb();
    await db.clear('orders');
    db.close();
    useOrderStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders inbound left and outbound right with status labels', async () => {
    vi.spyOn(apiMod, 'getConversation').mockResolvedValue({ conversation: conv() });
    vi.spyOn(apiMod, 'listMessages').mockResolvedValue({
      messages: [
        msg({ id: 'm2', direction: 'OUTBOUND', body: 'Hi Nomsa', status: 'DELIVERED', occurredAt: '2026-06-21T12:05:00Z' }),
        msg({ id: 'm1', direction: 'INBOUND', body: 'Hello there', occurredAt: '2026-06-21T12:00:00Z' }),
      ],
      pagination: { page: 1, limit: 50, total: 2 },
    });
    renderThread();
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
    expect(screen.getByText('Hi Nomsa')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('OPEN window enables the composer; CLOSED disables it with plain copy', async () => {
    vi.spyOn(apiMod, 'getConversation').mockResolvedValue({
      conversation: conv({ windowState: 'CLOSED', windowExpiresAt: null, lastInboundAt: '2026-06-19T12:00:00Z' }),
    });
    vi.spyOn(apiMod, 'listMessages').mockResolvedValue({ messages: [], pagination: { page: 1, limit: 50, total: 0 } });
    renderThread();
    await waitFor(() => expect(screen.getByPlaceholderText(/type your reply/i)).toBeDisabled());
    expect(screen.getAllByText(/resting/i).length).toBeGreaterThan(0);
  });

  it('a blocked send (409) removes the optimistic bubble and shows plain copy', async () => {
    vi.spyOn(apiMod, 'getConversation').mockResolvedValue({ conversation: conv() });
    vi.spyOn(apiMod, 'listMessages').mockResolvedValue({ messages: [], pagination: { page: 1, limit: 50, total: 0 } });
    vi.spyOn(apiMod, 'sendMessage').mockRejectedValue(
      new ApiError('whatsapp_window_closed', 'closed', 409),
    );
    renderThread();
    await waitFor(() => expect(screen.getByPlaceholderText(/type your reply/i)).not.toBeDisabled());
    await userEvent.type(screen.getByPlaceholderText(/type your reply/i), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/resting/i));
    // The optimistic bubble was removed — the thread falls back to the empty state.
    // (The textarea still holds "Hi"; the bubble does not.)
    expect(screen.getByText(/no messages in this chat/i)).toBeInTheDocument();
  });

  it('a 200-with-error marks the optimistic bubble FAILED with a retry', async () => {
    vi.spyOn(apiMod, 'getConversation').mockResolvedValue({ conversation: conv() });
    vi.spyOn(apiMod, 'listMessages').mockResolvedValue({ messages: [], pagination: { page: 1, limit: 50, total: 0 } });
    vi.spyOn(apiMod, 'sendMessage').mockResolvedValue({
      message: msg({ direction: 'OUTBOUND', body: 'Hi', status: 'FAILED' }),
      error: 'send_failed',
    });
    renderThread();
    await waitFor(() => expect(screen.getByPlaceholderText(/type your reply/i)).not.toBeDisabled());
    await userEvent.type(screen.getByPlaceholderText(/type your reply/i), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    const list = await screen.findByRole('list');
    await waitFor(() => expect(within(list).getByText('Hi')).toBeInTheDocument());
    expect(within(list).getByText(/didn't send/i)).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shares the catalog through the share route', async () => {
    vi.spyOn(apiMod, 'getConversation').mockResolvedValue({ conversation: conv() });
    vi.spyOn(apiMod, 'listMessages').mockResolvedValue({ messages: [], pagination: { page: 1, limit: 50, total: 0 } });
    const share = vi.spyOn(apiMod, 'shareCatalog').mockResolvedValue({
      message: msg({ direction: 'OUTBOUND', body: 'Bread R 15.00', status: 'SENT' }),
    });
    renderThread();
    await waitFor(() => expect(screen.getByRole('button', { name: /share catalog/i })).not.toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /share catalog/i }));
    await waitFor(() => expect(share).toHaveBeenCalledWith('biz1', 'c1', { sendClass: 'TRANSACTIONAL' }));
  });
});
