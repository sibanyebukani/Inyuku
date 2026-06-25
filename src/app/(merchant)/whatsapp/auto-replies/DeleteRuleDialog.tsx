'use client';

import type { AutoReplyRule } from '@/lib/whatsapp/api';
import { copy } from '@/lib/whatsapp/copy';

export function DeleteRuleDialog({
  rule,
  onConfirm,
  onCancel,
}: {
  rule: AutoReplyRule;
  onConfirm: (rule: AutoReplyRule) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.autoReplies.deleteConfirm}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm space-y-4 rounded bg-white p-4 shadow-lg">
        <p>{copy.autoReplies.deleteConfirm}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border px-4 py-2">
            {copy.autoReplies.cancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(rule)}
            className="rounded bg-red-600 px-4 py-2 text-white"
          >
            {copy.autoReplies.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
