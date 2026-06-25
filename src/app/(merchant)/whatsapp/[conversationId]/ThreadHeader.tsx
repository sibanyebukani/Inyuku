import Link from 'next/link';
import type { ConversationWithWindow } from '@/lib/whatsapp/api';
import { copy } from '@/lib/whatsapp/copy';

/**
 * Thread header. The full customer number is shown here only (the one place PII
 * is intentionally visible — already authorised by whatsapp:read).
 */
export function ThreadHeader({ conversation }: { conversation: ConversationWithWindow }) {
  const label = conversation.customerName?.trim() || conversation.waContactId;
  return (
    <div className="space-y-1">
      <Link href="/whatsapp" className="text-sm text-emerald-700 hover:underline">
        ‹ {copy.thread.back}
      </Link>
      <h1 className="text-xl font-semibold">{label}</h1>
      {conversation.customerName && (
        <p className="text-sm text-gray-600">{conversation.waContactId}</p>
      )}
    </div>
  );
}
