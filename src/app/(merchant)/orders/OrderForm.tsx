'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { useCustomerStore } from '@/lib/customers/store';
import { useOrderStore } from '@/lib/orders/store';
import { centsToZAR } from '@/lib/offline/money';
import { orderFormSchema, type OrderFormValues } from '@/lib/orders/schema';
import type { OrderLineRow } from '@/lib/offline/types';

interface PendingLine {
  productId: string;
  qty: string;
}

interface OrderFormProps {
  onDone?: (clientId: string) => void;
  /** Set for chat-captured orders. Defaults to IN_PERSON so the Orders screen is unchanged. */
  channel?: 'IN_PERSON' | 'WHATSAPP';
  /** Links a captured order back to its WhatsApp conversation (M3-B). */
  conversationId?: string;
  /** Pre-selects the conversation's customer when capturing from chat. */
  defaultCustomerId?: string;
}

type FormLine = {
  productId: string;
  nameSnapshot: string;
  unitPriceCents: number;
  qty: number;
  lineTotalCents: number;
};

export function OrderForm({
  onDone,
  channel = 'IN_PERSON',
  conversationId,
  defaultCustomerId,
}: OrderFormProps) {
  const { hasPerm } = useSession();
  const canWrite = hasPerm('order:write');

  const products = useProductStore((s) => s.items);
  const loadProducts = useProductStore((s) => s.load);
  const customers = useCustomerStore((s) => s.items);
  const loadCustomers = useCustomerStore((s) => s.load);
  const create = useOrderStore((s) => s.create);

  const [pending, setPending] = useState<PendingLine>({ productId: '', qty: '1' });

  useEffect(() => {
    void loadProducts();
    void loadCustomers();
  }, [loadProducts, loadCustomers]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.status === 'ACTIVE' && p.serverId),
    [products],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState,
    reset,
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerId: defaultCustomerId ?? '',
      paymentState: 'PAID',
      lines: [],
    },
  });

  const lines = watch('lines') as FormLine[];

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    return { subtotalCents: subtotal, totalCents: subtotal };
  }, [lines]);

  function addLine() {
    const product = activeProducts.find((p) => p.clientId === pending.productId || p.serverId === pending.productId);
    const qty = Number(pending.qty);
    if (!product || !Number.isInteger(qty) || qty < 1) return;

    const line: FormLine = {
      productId: product.serverId!,
      nameSnapshot: product.name,
      unitPriceCents: product.sellPriceCents,
      qty,
      lineTotalCents: product.sellPriceCents * qty,
    };
    setValue('lines', [...lines, line], { shouldValidate: true });
    setPending({ productId: '', qty: '1' });
  }

  function removeLine(index: number) {
    const next = [...lines];
    next.splice(index, 1);
    setValue('lines', next, { shouldValidate: true });
  }

  async function onSubmit(values: OrderFormValues) {
    if (!canWrite) return;
    const customerId = values.customerId || defaultCustomerId || undefined;
    const clientId = await create({
      customerId,
      conversationId,
      paymentState: values.paymentState,
      status: 'COMPLETED',
      channel,
      lines: values.lines,
      subtotalCents: totals.subtotalCents,
      totalCents: totals.totalCents,
    });
    reset();
    onDone?.(clientId);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="customerId" className="block text-sm font-medium">Customer (optional)</label>
        <select id="customerId" {...register('customerId')} className="mt-1 w-full rounded border px-3 py-2">
          <option value="">Walk-in</option>
          {customers.map((c) => (
            <option key={c.clientId} value={c.serverId ?? c.clientId}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="paymentState" className="block text-sm font-medium">Payment</label>
        <select id="paymentState" {...register('paymentState')} className="mt-1 w-full rounded border px-3 py-2">
          <option value="PAID">Paid</option>
          <option value="UNPAID">Unpaid</option>
        </select>
      </div>

      <div className="rounded border p-3">
        <p className="mb-2 text-sm font-medium">Add product</p>
        <div className="flex gap-2">
          <select
            aria-label="Product"
            value={pending.productId}
            onChange={(e) => setPending((p) => ({ ...p, productId: e.target.value }))}
            className="flex-1 rounded border px-3 py-2"
          >
            <option value="">Select product</option>
            {activeProducts.map((p) => (
              <option key={p.clientId} value={p.serverId}>
                {p.name} — {centsToZAR(p.sellPriceCents)}
              </option>
            ))}
          </select>
          <input
            aria-label="Quantity"
            type="number"
            min={1}
            step={1}
            value={pending.qty}
            onChange={(e) => setPending((p) => ({ ...p, qty: e.target.value }))}
            className="w-24 rounded border px-3 py-2"
          />
          <button
            type="button"
            onClick={addLine}
            disabled={!pending.productId || !Number.isInteger(Number(pending.qty)) || Number(pending.qty) < 1}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {activeProducts.length === 0 && (
          <p className="mt-2 text-sm text-gray-600">No synced products available. Sync products before recording a sale.</p>
        )}
      </div>

      {lines.length > 0 && (
        <div className="divide-y rounded border">
          {lines.map((line, idx) => (
            <div key={idx} className="flex items-center justify-between px-3 py-2">
              <div>
                <p className="font-medium">{line.nameSnapshot}</p>
                <p className="text-sm text-gray-600">
                  {line.qty} × {centsToZAR(line.unitPriceCents)} = {centsToZAR(line.lineTotalCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="text-sm text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {formState.errors.lines && (
        <p className="text-sm text-red-600">{formState.errors.lines.message}</p>
      )}

      <div className="text-lg font-semibold">Total: {centsToZAR(totals.totalCents)}</div>

      <button
        type="submit"
        disabled={formState.isSubmitting || lines.length === 0 || !canWrite}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Record sale
      </button>

      {!canWrite && (
        <p className="text-sm text-red-600">You do not have permission to record sales.</p>
      )}
    </form>
  );
}
