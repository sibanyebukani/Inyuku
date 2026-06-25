import Link from 'next/link';
import type { Conversation } from '@/lib/whatsapp/api';
import { maskMsisdn, needsReply, relativeSast, copy } from '@/lib/whatsapp/copy';

/**
 * One inbox row. Shows a customer label (name or masked msisdn), the SAST time
 * of the latest activity, and a needs-reply indicator. No message-body preview
 * is rendered — none exists on the list payload and it is the cleanest PII posture.
 */
export function ConversationRow({ conversation }: { conversation: Conversation }) {
  const label =
    conversation.customerName?.trim() || maskMsisdn(conversation.waContactId);
  const latest =
    [conversation.lastInboundAt, conversation.lastOutboundAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const waiting = needsReply(conversation);

  return (
    <li>
      <Link
        href={`/whatsapp/${conversation.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate ${waiting ? 'font-semibold' : 'font-medium'}`}>
            {waiting && (
              <span
                aria-hidden
                className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-600 align-middle"
              />
            )}
            {label}
          </p>
          <p className="text-sm text-gray-600">
            {relativeSast(latest)}
            {' · '}
            {conversation.status === 'ARCHIVED' ? 'Archived' : 'Open'}
            {waiting && (
              <span className="ml-2 text-emerald-700">{copy.inbox.needsReply}</span>
            )}
          </p>
        </div>
        <span aria-hidden className="text-gray-400">
          ›
        </span>
      </Link>
    </li>
  );
}
