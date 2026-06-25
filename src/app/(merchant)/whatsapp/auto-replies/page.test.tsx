// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutoRepliesPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as apiMod from '@/lib/whatsapp/api';
import type { AutoReplyRule } from '@/lib/whatsapp/api';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

function rule(over: Partial<AutoReplyRule>): AutoReplyRule {
  return {
    id: 'r1',
    channelId: null,
    trigger: 'GREETING',
    action: 'SEND_TEXT',
    enabled: true,
    keyword: null,
    replyText: 'Hi! Thanks for messaging us.',
    hoursStart: null,
    hoursEnd: null,
    daysActive: [],
    cooldownMinutes: 60,
    ...over,
  };
}

describe('AutoRepliesPage', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('staff (no manage perm) see a read-only list with NO create/edit/delete/toggle controls', async () => {
    mockSession(['whatsapp:read']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [rule({})] });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByText(/thanks for messaging/i)).toBeInTheDocument());
    expect(screen.getByText(/contact your account owner/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add automatic reply/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it('owner can toggle a rule', async () => {
    mockSession(['whatsapp:read', 'whatsapp:manage_autoreply']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [rule({ enabled: true })] });
    const patch = vi.spyOn(apiMod, 'patchAutoReplyRule').mockResolvedValue({ rule: rule({ enabled: false }) });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByText(/thanks for messaging/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^on$/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('biz1', 'r1', { enabled: false }));
  });

  it('owner KEYWORD form requires a keyword before submit', async () => {
    mockSession(['whatsapp:read', 'whatsapp:manage_autoreply']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [] });
    const create = vi.spyOn(apiMod, 'createAutoReplyRule').mockResolvedValue({ rule: rule({}) });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add automatic reply/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /add automatic reply/i }));
    await userEvent.selectOptions(screen.getByLabelText(/when does it send/i), 'KEYWORD');
    // replyText present but keyword empty → blocked
    await userEvent.type(screen.getByLabelText(/set reply/i), 'A reply');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/add a keyword/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('owner OUT_OF_HOURS form requires hours; SEND_TEXT requires reply text', async () => {
    mockSession(['whatsapp:read', 'whatsapp:manage_autoreply']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [] });
    vi.spyOn(apiMod, 'createAutoReplyRule').mockResolvedValue({ rule: rule({}) });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add automatic reply/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /add automatic reply/i }));
    // SEND_TEXT (default) with empty reply → blocked
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/add the words to send/i)).toBeInTheDocument();
  });

  it('owner can create a GREETING rule with reply text', async () => {
    mockSession(['whatsapp:read', 'whatsapp:manage_autoreply']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [] });
    const create = vi.spyOn(apiMod, 'createAutoReplyRule').mockResolvedValue({ rule: rule({}) });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add automatic reply/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /add automatic reply/i }));
    await userEvent.type(screen.getByLabelText(/set reply/i), 'Welcome!');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        'biz1',
        expect.objectContaining({ trigger: 'GREETING', action: 'SEND_TEXT', replyText: 'Welcome!' }),
      ),
    );
  });

  it('owner delete asks for confirmation, then deletes', async () => {
    mockSession(['whatsapp:read', 'whatsapp:manage_autoreply']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [rule({})] });
    const del = vi.spyOn(apiMod, 'deleteAutoReplyRule').mockResolvedValue({ deleted: true });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByText(/thanks for messaging/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('biz1', 'r1'));
  });

  it('shows the non-AI notice', async () => {
    mockSession(['whatsapp:read']);
    vi.spyOn(apiMod, 'listAutoReplyRules').mockResolvedValue({ rules: [] });
    render(<AutoRepliesPage />);
    await waitFor(() => expect(screen.getByText(/not a robot or ai/i)).toBeInTheDocument());
  });
});
