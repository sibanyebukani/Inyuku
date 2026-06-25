'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session/SessionProvider';
import {
  listAutoReplyRules,
  createAutoReplyRule,
  patchAutoReplyRule,
  deleteAutoReplyRule,
  type AutoReplyRule,
  type CreateRuleInput,
} from '@/lib/whatsapp/api';
import { copy } from '@/lib/whatsapp/copy';
import { NonAiNotice } from './NonAiNotice';
import { AutoReplyRuleList } from './AutoReplyRuleList';
import { AutoReplyRuleForm } from './AutoReplyRuleForm';
import { DeleteRuleDialog } from './DeleteRuleDialog';

export default function AutoRepliesPage() {
  const { activeBusinessId, hasPerm } = useSession();
  const canManage = hasPerm('whatsapp:manage_autoreply');

  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutoReplyRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AutoReplyRule | null>(null);

  const load = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    try {
      const { rules: r } = await listAutoReplyRules(activeBusinessId);
      setRules(r);
      setError(null);
    } catch {
      setError(copy.inbox.error);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = useCallback(
    async (rule: AutoReplyRule, enabled: boolean) => {
      const { rule: updated } = await patchAutoReplyRule(activeBusinessId, rule.id, { enabled });
      setRules((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    },
    [activeBusinessId],
  );

  const onSubmit = useCallback(
    async (input: CreateRuleInput) => {
      if (editing) {
        const { rule } = await patchAutoReplyRule(activeBusinessId, editing.id, input);
        setRules((rs) => rs.map((r) => (r.id === rule.id ? rule : r)));
      } else {
        const { rule } = await createAutoReplyRule(activeBusinessId, input);
        setRules((rs) => [...rs, rule]);
      }
      setEditing(null);
      setCreating(false);
    },
    [activeBusinessId, editing],
  );

  const onConfirmDelete = useCallback(
    async (rule: AutoReplyRule) => {
      await deleteAutoReplyRule(activeBusinessId, rule.id);
      setRules((rs) => rs.filter((r) => r.id !== rule.id));
      setDeleting(null);
    },
    [activeBusinessId],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{copy.autoReplies.title}</h1>
      <NonAiNotice />

      {!canManage && <p className="text-sm text-gray-600">{copy.autoReplies.staffReadOnly}</p>}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : (
        <>
          {canManage && !creating && !editing && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded bg-emerald-600 px-4 py-2 text-white"
            >
              {copy.autoReplies.addRule}
            </button>
          )}

          {canManage && (creating || editing) && (
            <AutoReplyRuleForm
              rule={editing ?? undefined}
              onSubmit={onSubmit}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          )}

          <AutoReplyRuleList
            rules={rules}
            canManage={canManage}
            onToggle={onToggle}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        </>
      )}

      {deleting && (
        <DeleteRuleDialog rule={deleting} onConfirm={onConfirmDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
