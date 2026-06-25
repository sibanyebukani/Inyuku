'use client';

import { useConversationStore } from './store';
import { needsReplyCount } from './copy';

/**
 * Needs-reply badge count, derived off the SAME list store the inbox polls —
 * no extra request (ADR-INY-025/026). Returns 0 until the inbox is loaded once.
 */
export function useWhatsAppUnread(): number {
  const conversations = useConversationStore((s) => s.conversations);
  return needsReplyCount(conversations);
}
