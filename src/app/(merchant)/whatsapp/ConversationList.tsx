import type { Conversation } from '@/lib/whatsapp/api';
import { ConversationRow } from './ConversationRow';
import { InboxEmptyState } from './InboxEmptyState';
import { copy } from '@/lib/whatsapp/copy';

interface ConversationListProps {
  conversations: Conversation[];
  stale: boolean;
  onRefresh: () => void;
}

export function ConversationList({ conversations, stale, onRefresh }: ConversationListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {stale ? (
          <p className="text-sm text-amber-700">{copy.inbox.stale}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="rounded border px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
        >
          {copy.inbox.refresh}
        </button>
      </div>
      {conversations.length === 0 ? (
        <InboxEmptyState />
      ) : (
        <ul className="divide-y rounded border">
          {conversations.map((c) => (
            <ConversationRow key={c.id} conversation={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
