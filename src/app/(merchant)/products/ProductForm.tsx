'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { zarToCents } from '@/lib/offline/money';
import { productFormSchema, type ProductFormValues } from '@/lib/products/schema';

export function ProductForm({ onDone }: { onDone?: () => void }) {
  const { hasPerm } = useSession();
  const canSeeCost = hasPerm('catalog:read_cost');
  const create = useProductStore((s) => s.create);
  const { register, handleSubmit, reset, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
  });

  async function onSubmit(values: ProductFormValues) {
    await create({
      name: values.name,
      sellPriceCents: zarToCents(values.sellPrice),
      ...(canSeeCost && values.costPrice ? { costPriceCents: zarToCents(values.costPrice) } : {}),
    });
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
      <button type="submit" disabled={formState.isSubmitting} className="rounded bg-emerald-600 px-4 py-2 text-white">
        Save
      </button>
    </form>
  );
}
