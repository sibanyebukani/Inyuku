'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { ApiError } from '@/lib/api-client';
import {
  getConversation,
  listMessages,
  sendMessage,
  shareCatalog,
  type ConversationWithWindow,
  type Message,
} from '@/lib/whatsapp/api';
import { usePoll } from '@/lib/whatsapp/usePoll';
import { sendErrorCopy, copy } from '@/lib/whatsapp/copy';
import { ThreadHeader } from './ThreadHeader';
import { WindowBanner } from './WindowBanner';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ShareCatalogButton } from './ShareCatalogButton';
import { CaptureOrderPanel } from './CaptureOrderPanel';
import { CapturedOrdersStrip } from './CapturedOrdersStrip';

function tempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { activeBusinessId, hasPerm } = useSession();
  const canSend = hasPerm('whatsapp:send');
  const canWrite = hasPerm('order:write');

  const [conversation, setConversation] = useState<ConversationWithWindow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [{ conversation: conv }, { messages: msgs }] = await Promise.all([
        getConversation(activeBusinessId, conversationId),
        listMessages(activeBusinessId, conversationId, { page: 1, limit: 50 }),
      ]);
      setConversation(conv);
      setMessages(msgs);
      setError(null);
      // Drop optimistic bubbles that the server now reflects.
      setOptimistic((opt) => opt.filter((o) => !msgs.some((m) => m.body === o.body && m.direction === 'OUTBOUND')));
    } catch {
      // Keep last-good; mark stale only on the very first load failure.
      setError((prev) => prev ?? copy.inbox.error);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  usePoll(() => void refresh(), 15_000, Boolean(activeBusinessId));

  const windowOpen = conversation?.windowState === 'OPEN';

  const pushOptimistic = useCallback((body: string): string => {
    const id = tempId();
    setOptimistic((o) => [
      ...o,
      {
        id,
        conversationId,
        direction: 'OUTBOUND',
        type: 'TEXT',
        body,
        sendClass: 'TRANSACTIONAL',
        templateName: null,
        status: 'QUEUED',
        failureReason: null,
        occurredAt: new Date().toISOString(),
      },
    ]);
    return id;
  }, [conversationId]);

  const markFailed = useCallback((id: string) => {
    setOptimistic((o) => o.map((m) => (m.id === id ? { ...m, status: 'FAILED' } : m)));
  }, []);

  const removeOptimistic = useCallback((id: string) => {
    setOptimistic((o) => o.filter((m) => m.id !== id));
  }, []);

  const handleSend = useCallback(
    async (body: string): Promise<boolean> => {
      if (!activeBusinessId) return false;
      setSendError(null);
      const id = pushOptimistic(body);
      try {
        const res = await sendMessage(activeBusinessId, conversationId, {
          type: 'TEXT',
          sendClass: 'TRANSACTIONAL',
          body,
        });
        if (res.error) {
          markFailed(id); // persisted-but-failed
          setSendError(sendErrorCopy(res.error));
          return false;
        }
        removeOptimistic(id);
        void refresh();
        return true;
      } catch (err) {
        // Blocked (409/422/403): remove the optimistic bubble, show plain copy.
        removeOptimistic(id);
        setSendError(sendErrorCopy(err instanceof ApiError ? err.code : undefined));
        return false;
      }
    },
    [activeBusinessId, conversationId, pushOptimistic, markFailed, removeOptimistic, refresh],
  );

  const handleShare = useCallback(async () => {
    if (!activeBusinessId) return;
    setSendError(null);
    try {
      const res = await shareCatalog(activeBusinessId, conversationId, {
        sendClass: 'TRANSACTIONAL',
      });
      if (res.error) {
        setSendError(sendErrorCopy(res.error));
        return;
      }
      void refresh();
    } catch (err) {
      setSendError(sendErrorCopy(err instanceof ApiError ? err.code : undefined));
    }
  }, [activeBusinessId, conversationId, refresh]);

  const notifyPaid = useCallback(
    async (totalCents: number) => {
      if (!activeBusinessId || !canSend) return;
      const rands = (totalCents / 100).toFixed(2);
      try {
        await sendMessage(activeBusinessId, conversationId, {
          type: 'TEXT',
          sendClass: 'TRANSACTIONAL',
          body: `Thank you! We've recorded your payment of R ${rands}.`,
        });
        void refresh();
      } catch {
        /* non-blocking — notify is optional */
      }
    },
    [activeBusinessId, canSend, conversationId, refresh],
  );

  if (loading && !conversation) {
    return <p className="py-8 text-center text-gray-500">{copy.thread.loading}</p>;
  }

  if (!conversation) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-red-700">
          {error ?? copy.inbox.error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ThreadHeader conversation={conversation} />
      <WindowBanner
        windowState={conversation.windowState}
        windowExpiresAt={conversation.windowExpiresAt}
      />

      <div className="rounded border p-3">
        <MessageList messages={messages} optimistic={optimistic} onRetry={(m) => m.body && handleSend(m.body)} />
      </div>

      {sendError && (
        <p role="alert" className="text-sm text-red-700">
          {sendError}
        </p>
      )}

      <div className="space-y-3">
        <Composer windowOpen={windowOpen} canSend={canSend} onSend={handleSend} />
        <div className="flex flex-wrap gap-2">
          <ShareCatalogButton windowOpen={windowOpen} canSend={canSend} onShare={handleShare} />
        </div>
      </div>

      <CaptureOrderPanel
        conversationId={conversationId}
        customerId={conversation.customerId ?? undefined}
      />

      <CapturedOrdersStrip
        conversationId={conversationId}
        businessId={activeBusinessId}
        canWrite={canWrite}
        onNotifyPaid={notifyPaid}
      />
    </div>
  );
}
