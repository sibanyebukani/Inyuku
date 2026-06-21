import { z } from 'zod';

/**
 * Stock-adjustment form schema.
 *
 * - ADJUSTMENT accepts a signed quantity: positive increases stock,
 *   negative decreases it ("adjust down"). A reason is required.
 * - RECEIVE accepts only a positive quantity (incoming stock). Reason is optional.
 *
 * Negative resulting stock is allowed by the backend; this schema never blocks it.
 */
export const stockAdjustmentSchema = z
  .object({
    productId: z.string().min(1, 'Select a product'),
    type: z.enum(['ADJUSTMENT', 'RECEIVE']),
    qty: z
      .string()
      .min(1, 'Quantity is required')
      .regex(/^-?\d+$/, 'Enter a whole number'),
    reason: z.string().optional(),
  })
  .refine((data) => Number(data.qty) !== 0, {
    message: 'Quantity cannot be zero',
    path: ['qty'],
  })
  .refine(
    (data) => {
      if (data.type === 'RECEIVE') return Number(data.qty) > 0;
      return true;
    },
    {
      message: 'Receive quantity must be positive',
      path: ['qty'],
    },
  )
  .refine(
    (data) => {
      if (data.type === 'ADJUSTMENT') {
        return data.reason != null && data.reason.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Reason is required for adjustments',
      path: ['reason'],
    },
  );

export type StockAdjustmentFormValues = z.infer<typeof stockAdjustmentSchema>;
