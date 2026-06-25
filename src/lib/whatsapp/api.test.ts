import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as authMod from '@/lib/session/authFetch';
import {
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  shareCatalog,
  listAutoReplyRules,
  createAutoReplyRule,
  patchAutoReplyRule,
  deleteAutoReplyRule,
  getWindowState,
} from './api';

describe('whatsapp api client', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(authMod, 'authFetch').mockResolvedValue({} as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('listConversations builds the right GET path with query', async () => {
    await listConversations('biz1', { page: 2, limit: 50 });
    expect(spy).toHaveBeenCalledWith(
      '/v1/businesses/biz1/whatsapp/conversations?page=2&limit=50',
      { method: 'GET' },
    );
  });

  it('listConversations omits query string when none given', async () => {
    await listConversations('biz1');
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/conversations', { method: 'GET' });
  });

  it('getConversation GETs the single conversation', async () => {
    await getConversation('biz1', 'c1');
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/conversations/c1', { method: 'GET' });
  });

  it('listMessages GETs the thread with pagination', async () => {
    await listMessages('biz1', 'c1', { page: 1, limit: 50 });
    expect(spy).toHaveBeenCalledWith(
      '/v1/businesses/biz1/whatsapp/conversations/c1/messages?page=1&limit=50',
      { method: 'GET' },
    );
  });

  it('sendMessage POSTs the body with sendClass', async () => {
    await sendMessage('biz1', 'c1', { type: 'TEXT', sendClass: 'TRANSACTIONAL', body: 'hi' });
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/conversations/c1/messages', {
      method: 'POST',
      body: JSON.stringify({ type: 'TEXT', sendClass: 'TRANSACTIONAL', body: 'hi' }),
    });
  });

  it('shareCatalog POSTs to the share-catalog path', async () => {
    await shareCatalog('biz1', 'c1', { sendClass: 'MARKETING' });
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/conversations/c1/share-catalog', {
      method: 'POST',
      body: JSON.stringify({ sendClass: 'MARKETING' }),
    });
  });

  it('listAutoReplyRules GETs the rules', async () => {
    await listAutoReplyRules('biz1');
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/auto-reply-rules', { method: 'GET' });
  });

  it('createAutoReplyRule POSTs the rule body', async () => {
    const body = { trigger: 'GREETING' as const, action: 'SEND_TEXT' as const, replyText: 'Hello!' };
    await createAutoReplyRule('biz1', body);
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/auto-reply-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  });

  it('patchAutoReplyRule PATCHes by id', async () => {
    await patchAutoReplyRule('biz1', 'r1', { enabled: false });
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/auto-reply-rules/r1', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
  });

  it('deleteAutoReplyRule DELETEs by id', async () => {
    await deleteAutoReplyRule('biz1', 'r1');
    expect(spy).toHaveBeenCalledWith('/v1/businesses/biz1/whatsapp/auto-reply-rules/r1', { method: 'DELETE' });
  });
});

describe('PII discipline — no body/waContactId logged', () => {
  it('never calls console with PII when sending', async () => {
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ message: { body: 'secret' } } as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await sendMessage('biz1', 'c1', { type: 'TEXT', sendClass: 'TRANSACTIONAL', body: 'secret' });
    await listConversations('biz1');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('getWindowState (client mirror of the server verdict)', () => {
  it('CLOSED when no inbound', () => {
    expect(getWindowState({ lastInboundAt: null })).toBe('CLOSED');
  });
  it('OPEN within 24h of last inbound', () => {
    const now = new Date('2026-06-21T12:00:00Z');
    expect(getWindowState({ lastInboundAt: '2026-06-21T06:00:00Z' }, now)).toBe('OPEN');
  });
  it('CLOSED beyond 24h of last inbound', () => {
    const now = new Date('2026-06-22T12:00:01Z');
    expect(getWindowState({ lastInboundAt: '2026-06-21T12:00:00Z' }, now)).toBe('CLOSED');
  });
});
