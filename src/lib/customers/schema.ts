import { z } from 'zod';

/**
 * E.164-ish phone validation. South African numbers are typically +27XXXXXXXXX
 * (11 digits incl. country code) or 0XXXXXXXXX (10 digits). We accept an
 * optional leading + and 7–15 digits so the directory works across markets.
 */
const PHONE_RE = /^\+?\d{7,15}$/;

export const customerFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
  phone: z
    .string()
    .regex(PHONE_RE, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  notes: z.string().max(2000, 'Notes are too long').optional().or(z.literal('')),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
