'use client';

import type { AutoReplyRule } from '@/lib/whatsapp/api';
import { copy } from '@/lib/whatsapp/copy';

interface AutoReplyRuleRowProps {
  rule: AutoReplyRule;
  canManage: boolean;
  onToggle: (rule: AutoReplyRule, enabled: boolean) => void;
  onEdit: (rule: AutoReplyRule) => void;
  onDelete: (rule: AutoReplyRule) => void;
}

function summary(rule: AutoReplyRule): string {
  if (rule.action === 'SHARE_CATALOG') return copy.autoReplies.actionShareCatalog;
  return rule.replyText ?? '';
}

export function AutoReplyRuleRow({ rule, canManage, onToggle, onEdit, onDelete }: AutoReplyRuleRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        {rule.trigger === 'KEYWORD' && rule.keyword && (
          <p className="text-sm text-gray-600">“{rule.keyword}”</p>
        )}
        {rule.trigger === 'OUT_OF_HOURS' && rule.hoursStart && rule.hoursEnd && (
          <p className="text-sm text-gray-600">
            {rule.hoursStart}–{rule.hoursEnd} SAST
          </p>
        )}
        <p className="truncate">{summary(rule)}</p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(rule, !rule.enabled)}
            aria-pressed={rule.enabled}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {rule.enabled ? copy.autoReplies.enable : copy.autoReplies.disable}
          </button>
          <button type="button" onClick={() => onEdit(rule)} className="text-sm text-emerald-700">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(rule)} className="text-sm text-red-700">
            {copy.autoReplies.delete}
          </button>
        </div>
      ) : (
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {rule.enabled ? copy.autoReplies.enable : copy.autoReplies.disable}
        </span>
      )}
    </li>
  );
}
