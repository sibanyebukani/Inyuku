import { z } from 'zod';

export const productFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sellPrice: z.string().min(1, 'Sell price is required'),
  costPrice: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
