'use client';

import { useState } from 'react';
import type { AutoReplyRule, CreateRuleInput } from '@/lib/whatsapp/api';
import { copy } from '@/lib/whatsapp/copy';

interface AutoReplyRuleFormProps {
  rule?: AutoReplyRule;
  channelId?: string | null;
  onSubmit: (input: CreateRuleInput) => Promise<void>;
  onCancel: () => void;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Create/edit form. Trigger-conditional fields mirror the server zod refinements
 * so invalid combos are blocked before submit. Non-AI framing in all labels.
 */
export function AutoReplyRuleForm({ rule, channelId, onSubmit, onCancel }: AutoReplyRuleFormProps) {
  const [trigger, setTrigger] = useState<AutoReplyRule['trigger']>(rule?.trigger ?? 'GREETING');
  const [action, setAction] = useState<AutoReplyRule['action']>(rule?.action ?? 'SEND_TEXT');
  const [keyword, setKeyword] = useState(rule?.keyword ?? '');
  const [replyText, setReplyText] = useState(rule?.replyText ?? '');
  const [hoursStart, setHoursStart] = useState(rule?.hoursStart ?? '');
  const [hoursEnd, setHoursEnd] = useState(rule?.hoursEnd ?? '');
  const [daysActive, setDaysActive] = useState<number[]>(rule?.daysActive ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleDay(day: number) {
    setDaysActive((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Mirror server refinements client-side.
    if (trigger === 'KEYWORD' && !keyword.trim()) return setError(copy.autoReplies.errKeyword);
    if (trigger === 'OUT_OF_HOURS' && (!hoursStart || !hoursEnd)) return setError(copy.autoReplies.errHours);
    if (action === 'SEND_TEXT' && !replyText.trim()) return setError(copy.autoReplies.errReplyText);
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        channelId: channelId ?? null,
        trigger,
        action,
        keyword: trigger === 'KEYWORD' ? keyword.trim() : null,
        replyText: action === 'SEND_TEXT' ? replyText.trim() : null,
        hoursStart: trigger === 'OUT_OF_HOURS' ? hoursStart : null,
        hoursEnd: trigger === 'OUT_OF_HOURS' ? hoursEnd : null,
        daysActive: trigger === 'OUT_OF_HOURS' ? daysActive : [],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded border p-3">
      <div>
        <label htmlFor="ar-trigger" className="block text-sm font-medium">
          {copy.autoReplies.fieldTrigger}
        </label>
        <select
          id="ar-trigger"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as AutoReplyRule['trigger'])}
          className="mt-1 w-full rounded border px-3 py-2"
        >
          <option value="GREETING">{copy.autoReplies.triggerGreeting}</option>
          <option value="KEYWORD">{copy.autoReplies.triggerKeyword}</option>
          <option value="OUT_OF_HOURS">{copy.autoReplies.triggerOutOfHours}</option>
        </select>
      </div>

      <div>
        <label htmlFor="ar-action" className="block text-sm font-medium">
          {copy.autoReplies.fieldAction}
        </label>
        <select
          id="ar-action"
          value={action}
          onChange={(e) => setAction(e.target.value as AutoReplyRule['action'])}
          className="mt-1 w-full rounded border px-3 py-2"
        >
          <option value="SEND_TEXT">{copy.autoReplies.actionSendText}</option>
          <option value="SHARE_CATALOG">{copy.autoReplies.actionShareCatalog}</option>
        </select>
      </div>

      {trigger === 'KEYWORD' && (
        <div>
          <label htmlFor="ar-keyword" className="block text-sm font-medium">
            {copy.autoReplies.fieldKeyword}
          </label>
          <input
            id="ar-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {action === 'SEND_TEXT' && (
        <div>
          <label htmlFor="ar-reply" className="block text-sm font-medium">
            {copy.autoReplies.fieldReplyText}
          </label>
          <textarea
            id="ar-reply"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      )}

      {trigger === 'OUT_OF_HOURS' && (
        <div className="space-y-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="ar-from" className="block text-sm font-medium">
                {copy.autoReplies.fieldHoursStart}
              </label>
              <input
                id="ar-from"
                type="time"
                value={hoursStart}
                onChange={(e) => setHoursStart(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="ar-to" className="block text-sm font-medium">
                {copy.autoReplies.fieldHoursEnd}
              </label>
              <input
                id="ar-to"
                type="time"
                value={hoursEnd}
                onChange={(e) => setHoursEnd(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{copy.autoReplies.fieldDays}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DAYS.map((day, i) => (
                <label key={day} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={daysActive.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {DAY_LABELS[i]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {copy.autoReplies.save}
        </button>
        <button type="button" onClick={onCancel} className="rounded border px-4 py-2">
          {copy.autoReplies.cancel}
        </button>
      </div>
    </form>
  );
}
