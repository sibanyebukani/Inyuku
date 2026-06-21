import { z } from 'zod';

export const orderLineSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  nameSnapshot: z.string().min(1),
  unitPriceCents: z.number().int().min(0),
  qty: z.number().int().min(1, 'Quantity must be at least 1'),
  lineTotalCents: z.number().int().min(0),
});

export const orderFormSchema = z.object({
  customerId: z.string().optional().or(z.literal('')),
  paymentState: z.enum(['PAID', 'UNPAID']),
  lines: z.array(orderLineSchema).min(1, 'Add at least one product'),
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;
