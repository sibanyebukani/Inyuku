'use client';

import { useState } from 'react';
import { useOnline } from '@/lib/offline/useOnline';
import { copy } from '@/lib/whatsapp/copy';

interface ShareCatalogButtonProps {
  windowOpen: boolean;
  canSend: boolean;
  onShare: () => Promise<void>;
}

export function ShareCatalogButton({ windowOpen, canSend, onShare }: ShareCatalogButtonProps) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  const disabledReason = !canSend
    ? copy.thread.noSendPerm
    : !windowOpen
      ? copy.window.closed
      : !online
        ? copy.thread.offlineSend
        : undefined;
  const disabled = Boolean(disabledReason) || busy;

  async function click() {
    if (disabled) return;
    setBusy(true);
    try {
      await onShare();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      title={disabledReason}
      className="rounded border px-3 py-2 text-sm text-emerald-700 disabled:opacity-50"
    >
      {busy ? copy.thread.sending : copy.thread.shareCatalog}
    </button>
  );
}
