import type { Message } from '@/lib/whatsapp/api';
import { statusLabel, formatSastTime } from '@/lib/whatsapp/copy';

/**
 * A single message bubble. Direction-aware (INBOUND left / OUTBOUND right). The
 * raw `body` is rendered ONLY here (PII discipline). FAILED outbound shows a
 * retry affordance via `onRetry`.
 */
export function MessageBubble({
  message,
  onRetry,
}: {
  message: Message;
  onRetry?: (m: Message) => void;
}) {
  const outbound = message.direction === 'OUTBOUND';
  const failed = message.status === 'FAILED';
  return (
    <li className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          outbound ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
        <p className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
          <span>{formatSastTime(message.occurredAt)}</span>
          {outbound && (
            <span className={failed ? 'text-red-600' : undefined}>{statusLabel(message.status)}</span>
          )}
        </p>
        {outbound && failed && onRetry && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-1 text-xs font-medium text-red-700 underline"
          >
            Try again
          </button>
        )}
      </div>
    </li>
  );
}
