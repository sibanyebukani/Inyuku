'use client';

import type { AutoReplyRule } from '@/lib/whatsapp/api';
import { TRIGGER_GROUPS, copy } from '@/lib/whatsapp/copy';
import { AutoReplyRuleRow } from './AutoReplyRuleRow';

interface AutoReplyRuleListProps {
  rules: AutoReplyRule[];
  canManage: boolean;
  onToggle: (rule: AutoReplyRule, enabled: boolean) => void;
  onEdit: (rule: AutoReplyRule) => void;
  onDelete: (rule: AutoReplyRule) => void;
}

export function AutoReplyRuleList({ rules, canManage, onToggle, onEdit, onDelete }: AutoReplyRuleListProps) {
  if (rules.length === 0) {
    return <p className="rounded border border-dashed p-6 text-center text-gray-500">{copy.autoReplies.empty}</p>;
  }
  return (
    <div className="space-y-4">
      {TRIGGER_GROUPS.map(({ trigger, label }) => {
        const group = rules.filter((r) => r.trigger === trigger);
        if (group.length === 0) return null;
        return (
          <section key={trigger}>
            <h2 className="mb-1 text-sm font-medium text-gray-700">{label}</h2>
            <ul className="divide-y rounded border">
              {group.map((rule) => (
                <AutoReplyRuleRow
                  key={rule.id}
                  rule={rule}
                  canManage={canManage}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
