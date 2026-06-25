'use client';

import { useState } from 'react';
import { OrderForm } from '@/app/(merchant)/orders/OrderForm';
import { copy } from '@/lib/whatsapp/copy';

interface CaptureOrderPanelProps {
  conversationId: string;
  /** The conversation's linked customer (server id), pre-selected in the picker. */
  customerId?: string;
  onCaptured?: (clientId: string) => void;
}

/**
 * Collapsible order-capture panel. Reuses the existing <OrderForm> (sell-price
 * only, RBAC cost-split inherited) pre-seeded with channel=WHATSAPP and the
 * conversation linkage so capture rides the M2 clientId/sync path (ADR-INY-027).
 */
export function CaptureOrderPanel({ conversationId, customerId, onCaptured }: CaptureOrderPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sm font-medium text-emerald-700"
      >
        {open ? copy.order.captureClose : copy.order.captureOpen}
      </button>
      {open && (
        <div className="mt-3">
          <OrderForm
            channel="WHATSAPP"
            conversationId={conversationId}
            defaultCustomerId={customerId}
            onDone={(clientId) => {
              setOpen(false);
              onCaptured?.(clientId);
            }}
          />
        </div>
      )}
    </div>
  );
}
