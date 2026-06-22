'use client';

import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { uploadProductImage } from '@/lib/products/image';
import { centsToZAR, zarToCents } from '@/lib/offline/money';
import { productFormSchema, type ProductFormValues } from '@/lib/products/schema';
import type { ProductRow } from '@/lib/offline/types';

interface ProductFormProps {
  row?: ProductRow;
  onDone?: () => void;
}

export function ProductForm({ row, onDone }: ProductFormProps) {
  const { hasPerm, activeBusinessId } = useSession();
  const canSeeCost = hasPerm('catalog:read_cost');
  const create = useProductStore((s) => s.create);
  const update = useProductStore((s) => s.update);
  const fileRef = useRef<File | null>(null);

  const isEdit = Boolean(row);
  const defaultValues: ProductFormValues = {
    name: row?.name ?? '',
    sellPrice: row ? centsToZAR(row.sellPriceCents) : '',
    costPrice: row?.costPriceCents != null ? centsToZAR(row.costPriceCents) : '',
    lowStockThreshold: row?.lowStockThreshold != null ? String(row.lowStockThreshold) : '',
  };

  const { register, handleSubmit, reset, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ProductFormValues) {
    const patch = {
      name: values.name,
      sellPriceCents: zarToCents(values.sellPrice),
      ...(canSeeCost && values.costPrice ? { costPriceCents: zarToCents(values.costPrice) } : {}),
      ...(values.lowStockThreshold ? { lowStockThreshold: Number(values.lowStockThreshold) } : {}),
    };

    let clientId: string;
    if (row) {
      await update(row.clientId, patch);
      clientId = row.clientId;
    } else {
      clientId = await create(patch);
    }

    const file = fileRef.current;
    if (file) {
      await uploadProductImage(clientId, file, activeBusinessId);
      fileRef.current = null;
    }

    reset();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" {...register('name')} className="mt-1 w-full rounded border px-3 py-2" />
        {formState.errors.name && <p className="text-sm text-red-600">{formState.errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="sellPrice" className="block text-sm font-medium">Sell price (R)</label>
        <input id="sellPrice" inputMode="decimal" {...register('sellPrice')} className="mt-1 w-full rounded border px-3 py-2" />
        {formState.errors.sellPrice && <p className="text-sm text-red-600">{formState.errors.sellPrice.message}</p>}
      </div>
      {canSeeCost && (
        <div>
          <label htmlFor="costPrice" className="block text-sm font-medium">Cost price (R)</label>
          <input id="costPrice" inputMode="decimal" {...register('costPrice')} className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      )}
      <div>
        <label htmlFor="lowStockThreshold" className="block text-sm font-medium">Low-stock threshold</label>
        <input id="lowStockThreshold" inputMode="numeric" {...register('lowStockThreshold')} className="mt-1 w-full rounded border px-3 py-2" />
        {formState.errors.lowStockThreshold && <p className="text-sm text-red-600">{formState.errors.lowStockThreshold.message}</p>}
      </div>
      <div>
        <label htmlFor="image" className="block text-sm font-medium">Image</label>
        <input
          id="image"
          type="file"
          accept="image/*"
          onChange={(e) => { fileRef.current = e.target.files?.[0] ?? null; }}
          className="mt-1 w-full text-sm"
        />
      </div>
      <button type="submit" disabled={formState.isSubmitting} className="rounded bg-emerald-600 px-4 py-2 text-white">
        {isEdit ? 'Update product' : 'Save'}
      </button>
    </form>
  );
}
