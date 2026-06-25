'use client';

import { useState } from 'react';
import { useOnline } from '@/lib/offline/useOnline';
import { copy } from '@/lib/whatsapp/copy';

interface ComposerProps {
  windowOpen: boolean;
  canSend: boolean;
  /** Resolves true on a successful send so the input can clear. */
  onSend: (body: string) => Promise<boolean>;
}

export function Composer({ windowOpen, canSend, onSend }: ComposerProps) {
  const online = useOnline();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const disabledReason = !canSend
    ? copy.thread.noSendPerm
    : !windowOpen
      ? copy.window.closed
      : !online
        ? copy.thread.offlineSend
        : undefined;
  const disabled = Boolean(disabledReason) || busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !body.trim()) return;
    setBusy(true);
    try {
      const ok = await onSend(body.trim());
      if (ok) setBody('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor="wa-reply" className="sr-only">
        {copy.thread.composerPlaceholder}
      </label>
      <div className="flex gap-2">
        <textarea
          id="wa-reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={copy.thread.composerPlaceholder}
          rows={2}
          disabled={Boolean(disabledReason)}
          aria-describedby={disabledReason ? 'wa-reply-help' : undefined}
          title={disabledReason}
          className="flex-1 rounded border px-3 py-2 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={disabled || !body.trim()}
          className="self-end rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? copy.thread.sending : copy.thread.send}
        </button>
      </div>
      {disabledReason && (
        <p id="wa-reply-help" className="text-sm text-gray-600">
          {disabledReason}
        </p>
      )}
    </form>
  );
}
