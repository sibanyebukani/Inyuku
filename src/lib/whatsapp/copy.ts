import type { Conversation, MessageStatus } from './api';

/**
 * Centralised plain-language, low-literacy WhatsApp copy (ADR-INY-028).
 * Raw platform error codes NEVER reach the merchant — they are mapped here.
 * English ships first; this map is structured so isiZulu/isiXhosa can be added.
 * Mirror keys live in src/messages/*.json under "whatsapp" for future next-intl.
 */
export const copy = {
  nav: { label: 'WhatsApp' },
  inbox: {
    title: 'WhatsApp',
    refresh: 'Refresh',
    stale: 'Showing your last view — reconnect to update',
    empty:
      'No chats yet. This inbox fills up as customers message your shop on WhatsApp.',
    needsReply: 'Waiting for your reply',
    error: 'Could not load your chats. Pull to refresh when you have signal.',
  },
  thread: {
    back: 'Back to chats',
    loading: 'Loading messages…',
    empty: 'No messages in this chat yet.',
    composerPlaceholder: 'Type your reply…',
    send: 'Send',
    sending: 'Sending…',
    shareCatalog: 'Share catalog',
    newOrder: 'New order',
    retry: 'Try again',
    offlineSend: "You're offline — this will send when you're back online.",
    noSendPerm: 'You do not have permission to send messages.',
  },
  window: {
    // {time} → SAST HH:mm of windowExpiresAt
    open: 'You can reply now. Free replies until {time} today.',
    openNoExpiry: 'You can reply now.',
    closed:
      'This chat is resting. Your customer needs to message you first before you can reply.',
  },
  // Blocked-send mapping — raw codes are never shown.
  sendError: {
    whatsapp_window_closed:
      'This chat is resting. Your customer needs to message you first before you can reply.',
    whatsapp_consent_denied:
      "We can't message this customer yet — they haven't agreed to messages.",
    whatsapp_channel_disabled:
      "WhatsApp sending isn't switched on for your shop yet.",
    whatsapp_template_invalid: "That update isn't ready to send yet.",
    send_failed: "That message didn't send. Try again.",
    default: "That message didn't send. Try again.",
  } as Record<string, string>,
  order: {
    captured: 'Order captured',
    paid: 'Paid',
    unpaid: 'Unpaid',
    markPaid: 'Mark paid',
    markUnpaid: 'Mark unpaid',
    notify: 'Tell the customer it’s paid',
    noPayPerm: 'You do not have permission to change payment.',
    capturePanelTitle: 'Capture an order',
    captureOpen: 'Capture an order from this chat',
    captureClose: 'Hide order capture',
  },
  autoReplies: {
    title: 'Automatic replies',
    nonAi:
      'These are your own simple, set replies — not a robot or AI. They send the exact words you type, only when a message matches.',
    addRule: 'Add automatic reply',
    empty: 'No automatic replies yet.',
    staffReadOnly:
      'Only your account owner can set up automatic replies. Contact your account owner to change these.',
    groupGreeting: 'Greeting',
    groupKeyword: 'Keyword',
    groupOutOfHours: 'Out of hours',
    enable: 'On',
    disable: 'Off',
    delete: 'Delete',
    deleteConfirm: 'Delete this automatic reply? This cannot be undone.',
    save: 'Save',
    cancel: 'Cancel',
    fieldTrigger: 'When does it send?',
    fieldAction: 'What does it do?',
    fieldKeyword: 'Keyword to match',
    fieldReplyText: 'Set reply',
    fieldHoursStart: 'From (SAST)',
    fieldHoursEnd: 'To (SAST)',
    fieldDays: 'Days active',
    actionSendText: 'Send a set reply',
    actionShareCatalog: 'Share my catalog',
    triggerGreeting: 'On a greeting',
    triggerKeyword: 'On an exact keyword',
    triggerOutOfHours: 'When my shop is closed',
    errKeyword: 'Add a keyword for this reply to match.',
    errHours: 'Add both a start and end time.',
    errReplyText: 'Add the words to send.',
  },
} as const;

const STATUS_LABELS: Record<MessageStatus, string> = {
  RECEIVED: 'Received',
  QUEUED: 'Sending',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: "Didn't send",
};

/** Plain-language delivery status for an outbound (or inbound) message. */
export function statusLabel(status: MessageStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Map a blocked-send error code to plain-language copy. Never returns a raw code. */
export function sendErrorCopy(code: string | undefined): string {
  if (!code) return copy.sendError.default;
  return copy.sendError[code] ?? copy.sendError.default;
}

/**
 * Needs-my-reply derivation (ADR-INY-025). True when the customer's last inbound
 * is newer than our last outbound (or we have never replied).
 */
export function needsReply(
  c: Pick<Conversation, 'lastInboundAt' | 'lastOutboundAt'>,
): boolean {
  if (!c.lastInboundAt) return false;
  if (!c.lastOutboundAt) return true;
  return c.lastInboundAt > c.lastOutboundAt;
}

/** Count of conversations waiting for a reply, over the loaded page. */
export function needsReplyCount(
  conversations: Pick<Conversation, 'lastInboundAt' | 'lastOutboundAt'>[],
): number {
  return conversations.reduce((n, c) => n + (needsReply(c) ? 1 : 0), 0);
}

/**
 * Mask a WhatsApp contact id / msisdn, showing only the last 3 digits.
 * PII discipline — used everywhere except the thread header.
 */
export function maskMsisdn(waContactId: string): string {
  const digits = waContactId.replace(/\D/g, '');
  if (digits.length <= 3) return `•••${digits}`;
  return `•••${digits.slice(-3)}`;
}

const SAST = 'Africa/Johannesburg';

/** SAST date+time, e.g. "21 Jun 2026, 14:32". */
export function formatSast(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-ZA', {
    timeZone: SAST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** SAST time only, e.g. "14:32". */
export function formatSastTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-ZA', {
    timeZone: SAST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Short relative SAST time for list rows, falling back to a SAST date. */
export function relativeSast(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now.getTime() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatSast(iso);
}

/** Window banner text given server window verdict + expiry. */
export function windowBannerCopy(
  state: 'OPEN' | 'CLOSED',
  windowExpiresAt: string | null,
): string {
  if (state === 'CLOSED') return copy.window.closed;
  if (!windowExpiresAt) return copy.window.openNoExpiry;
  return copy.window.open.replace('{time}', formatSastTime(windowExpiresAt));
}

export const TRIGGER_GROUPS: { trigger: 'GREETING' | 'KEYWORD' | 'OUT_OF_HOURS'; label: string }[] = [
  { trigger: 'GREETING', label: copy.autoReplies.groupGreeting },
  { trigger: 'KEYWORD', label: copy.autoReplies.groupKeyword },
  { trigger: 'OUT_OF_HOURS', label: copy.autoReplies.groupOutOfHours },
];
