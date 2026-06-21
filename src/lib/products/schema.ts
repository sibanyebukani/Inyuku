import { z } from 'zod';

/**
 * Matches the exact set of strings that zarToCents accepts:
 * optional "R" prefix, optional whitespace, then digits with an optional
 * fractional part of 1 or 2 digits.  Aligned to the regex in money.ts:
 *   /^\d+(\.\d{1,2})?$/  (applied after stripping R and whitespace)
 */
const ZAR_AMOUNT_RE = /^R?\s*\d+(\.\d{1,2})?$/;
const zarAmountMsg = 'Enter a valid amount like 25.00';

export const productFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sellPrice: z
    .string()
    .min(1, 'Sell price is required')
    .regex(ZAR_AMOUNT_RE, zarAmountMsg),
  costPrice: z.string().regex(ZAR_AMOUNT_RE, zarAmountMsg).optional().or(z.literal('')),
  lowStockThreshold: z
    .string()
    .regex(/^\d*$/, 'Enter a whole number')
    .optional()
    .or(z.literal('')),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
