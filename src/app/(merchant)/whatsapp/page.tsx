'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from '@/lib/session/SessionProvider';
import { useConversationStore } from '@/lib/whatsapp/store';
import { usePoll } from '@/lib/whatsapp/usePoll';
import { copy } from '@/lib/whatsapp/copy';
import { ConversationList } from './ConversationList';

export default function WhatsAppInboxPage() {
  const { activeBusinessId } = useSession();
  const conversations = useConversationStore((s) => s.conversations);
  const stale = useConversationStore((s) => s.stale);
  const loading = useConversationStore((s) => s.loading);
  const loaded = useConversationStore((s) => s.loaded);
  const load = useConversationStore((s) => s.load);
  const refresh = useConversationStore((s) => s.refresh);

  useEffect(() => {
    if (activeBusinessId) void load(activeBusinessId);
  }, [activeBusinessId, load]);

  const poll = useCallback(() => {
    if (activeBusinessId) void refresh(activeBusinessId);
  }, [activeBusinessId, refresh]);
  usePoll(poll, 30_000, Boolean(activeBusinessId));

  const onRefresh = useCallback(() => {
    if (activeBusinessId) void refresh(activeBusinessId);
  }, [activeBusinessId, refresh]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{copy.inbox.title}</h1>
      {loading && !loaded ? (
        <ul className="animate-pulse divide-y rounded border" aria-label="Loading conversations">
          {[0, 1, 2].map((i) => (
            <li key={i} className="px-4 py-3">
              <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </li>
          ))}
        </ul>
      ) : (
        <ConversationList conversations={conversations} stale={stale} onRefresh={onRefresh} />
      )}
    </div>
  );
}
