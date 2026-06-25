import { authFetch } from '@/lib/session/authFetch';

// ─── Wire types (mirror the frozen M3-A/M3-B read/send surface) ──────────────

export interface Conversation {
  id: string;
  businessId: string;
  channelId: string;
  customerId: string | null;
  waContactId: string;
  /** Server may attach a display name; not guaranteed on the raw row. */
  customerName?: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  status: 'OPEN' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithWindow extends Conversation {
  windowState: 'OPEN' | 'CLOSED';
  windowExpiresAt: string | null;
}

export type MessageStatus =
  | 'RECEIVED'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED';

export interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string | null;
  sendClass: 'TRANSACTIONAL' | 'MARKETING' | null;
  templateName: string | null;
  status: MessageStatus;
  failureReason: string | null;
  occurredAt: string;
}

export type AutoReplyTrigger = 'GREETING' | 'KEYWORD' | 'OUT_OF_HOURS';
export type AutoReplyAction = 'SEND_TEXT' | 'SHARE_CATALOG';

export interface AutoReplyRule {
  id: string;
  channelId: string | null;
  trigger: AutoReplyTrigger;
  action: AutoReplyAction;
  enabled: boolean;
  keyword: string | null;
  replyText: string | null;
  hoursStart: string | null;
  hoursEnd: string | null;
  daysActive: number[];
  cooldownMinutes: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface SendClassInput {
  sendClass: 'TRANSACTIONAL' | 'MARKETING';
}

export interface SendMessageInput extends SendClassInput {
  type: 'TEXT';
  body: string;
}

export interface ShareCatalogInput extends SendClassInput {
  productIds?: string[];
}

export interface CreateRuleInput {
  channelId?: string | null;
  trigger: AutoReplyTrigger;
  action: AutoReplyAction;
  enabled?: boolean;
  keyword?: string | null;
  replyText?: string | null;
  hoursStart?: string | null;
  hoursEnd?: string | null;
  daysActive?: number[];
  cooldownMinutes?: number;
}

export type PatchRuleInput = Partial<Omit<CreateRuleInput, 'trigger' | 'action'>>;

const base = (b: string) => `/v1/businesses/${b}/whatsapp`;

function withQuery(path: string, q?: { page?: number; limit?: number }): string {
  if (!q) return path;
  const params = new URLSearchParams();
  if (q.page != null) params.set('page', String(q.page));
  if (q.limit != null) params.set('limit', String(q.limit));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// ─── Reads (whatsapp:read) ───────────────────────────────────────────────────

export function listConversations(
  b: string,
  q?: { page?: number; limit?: number },
): Promise<{ conversations: Conversation[]; pagination: Pagination }> {
  return authFetch(withQuery(`${base(b)}/conversations`, q), { method: 'GET' });
}

export function getConversation(
  b: string,
  id: string,
): Promise<{ conversation: ConversationWithWindow }> {
  return authFetch(`${base(b)}/conversations/${id}`, { method: 'GET' });
}

export function listMessages(
  b: string,
  id: string,
  q?: { page?: number; limit?: number },
): Promise<{ messages: Message[]; pagination: Pagination }> {
  return authFetch(withQuery(`${base(b)}/conversations/${id}/messages`, q), {
    method: 'GET',
  });
}

// ─── Sends (whatsapp:send) — server decides free-form vs template ────────────

export function sendMessage(
  b: string,
  id: string,
  input: SendMessageInput,
): Promise<{ message: Message; error?: string }> {
  return authFetch(`${base(b)}/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function shareCatalog(
  b: string,
  id: string,
  input: ShareCatalogInput,
): Promise<{ message: Message; error?: string }> {
  return authFetch(`${base(b)}/conversations/${id}/share-catalog`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Auto-reply CRUD (read=whatsapp:read; mutate=whatsapp:manage_autoreply) ──

export function listAutoReplyRules(b: string): Promise<{ rules: AutoReplyRule[] }> {
  return authFetch(`${base(b)}/auto-reply-rules`, { method: 'GET' });
}

export function createAutoReplyRule(
  b: string,
  body: CreateRuleInput,
): Promise<{ rule: AutoReplyRule }> {
  return authFetch(`${base(b)}/auto-reply-rules`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchAutoReplyRule(
  b: string,
  id: string,
  body: PatchRuleInput,
): Promise<{ rule: AutoReplyRule }> {
  return authFetch(`${base(b)}/auto-reply-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAutoReplyRule(
  b: string,
  id: string,
): Promise<{ deleted: true }> {
  return authFetch(`${base(b)}/auto-reply-rules/${id}`, { method: 'DELETE' });
}

/**
 * Client-side convenience mirror of the server window verdict. The server is
 * authoritative (`getConversation().windowState`); this only derives the same
 * OPEN/CLOSED rule for a raw `Conversation` row when we have no window read yet
 * (e.g. list context). The 24h window is anchored on `lastInboundAt`.
 */
export function getWindowState(
  conv: Pick<Conversation, 'lastInboundAt'>,
  now: Date = new Date(),
): 'OPEN' | 'CLOSED' {
  if (!conv.lastInboundAt) return 'CLOSED';
  const last = new Date(conv.lastInboundAt).getTime();
  if (Number.isNaN(last)) return 'CLOSED';
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  return now.getTime() - last < WINDOW_MS ? 'OPEN' : 'CLOSED';
}
