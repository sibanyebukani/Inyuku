'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/lib/session/SessionProvider';
import { useCustomerStore } from '@/lib/customers/store';
import { customerFormSchema, type CustomerFormValues } from '@/lib/customers/schema';
import type { CustomerRow } from '@/lib/offline/types';

interface CustomerFormProps {
  row?: CustomerRow;
  onDone?: () => void;
}

export function CustomerForm({ row, onDone }: CustomerFormProps) {
  const { hasPerm } = useSession();
  const canWrite = hasPerm('customer:write');
  const create = useCustomerStore((s) => s.create);
  const update = useCustomerStore((s) => s.update);

  const isEdit = Boolean(row);
  const defaultValues: CustomerFormValues = {
    name: row?.name ?? '',
    phone: row?.phone ?? '',
    email: row?.email ?? '',
    notes: row?.notes ?? '',
  };

  const { register, handleSubmit, reset, formState } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  });

  async function onSubmit(values: CustomerFormValues) {
    const input = {
      name: values.name,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };

    if (row) {
      await update(row.clientId, input);
    } else {
      await create(input);
    }

    reset();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          {...register('name')}
          disabled={!canWrite}
          className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"
        />
        {formState.errors.name && <p className="text-sm text-red-600">{formState.errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          {...register('phone')}
          disabled={!canWrite}
          className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"
        />
        {formState.errors.phone && <p className="text-sm text-red-600">{formState.errors.phone.message}</p>}
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          {...register('email')}
          disabled={!canWrite}
          className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"
        />
        {formState.errors.email && <p className="text-sm text-red-600">{formState.errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          {...register('notes')}
          disabled={!canWrite}
          rows={3}
          className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"
        />
        {formState.errors.notes && <p className="text-sm text-red-600">{formState.errors.notes.message}</p>}
      </div>
      <button
        type="submit"
        disabled={formState.isSubmitting || !canWrite}
        className="rounded bg-emerald-600 px-4 py-2 text-white disabled:bg-gray-400"
      >
        {isEdit ? 'Update customer' : 'Save customer'}
      </button>
    </form>
  );
}
