import type { Message } from '@/lib/whatsapp/api';
import { MessageBubble } from './MessageBubble';
import { copy } from '@/lib/whatsapp/copy';

/**
 * Chronological message list. `messages` arrive newest-first from the server and
 * are reversed here; `optimistic` in-flight bubbles append at the end.
 */
export function MessageList({
  messages,
  optimistic = [],
  onRetry,
}: {
  messages: Message[];
  optimistic?: Message[];
  onRetry?: (m: Message) => void;
}) {
  const chronological = [...messages].reverse();
  const all = [...chronological, ...optimistic];

  if (all.length === 0) {
    return <p className="py-8 text-center text-gray-500">{copy.thread.empty}</p>;
  }

  return (
    <ul className="space-y-2">
      {all.map((m) => (
        <MessageBubble key={m.id} message={m} onRetry={onRetry} />
      ))}
    </ul>
  );
}
