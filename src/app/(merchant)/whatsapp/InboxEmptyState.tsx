import { copy } from '@/lib/whatsapp/copy';

export function InboxEmptyState() {
  return (
    <div className="rounded border border-dashed p-8 text-center text-gray-500">
      {copy.inbox.empty}
    </div>
  );
}
