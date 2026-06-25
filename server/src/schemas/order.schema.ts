import { z } from 'zod';

export const orderLineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
});

/** Shared order fields used by BOTH the online POST /orders body and the offline sync order-create payload (Condition 8). */
export const orderFieldsSchema = z.object({
  channel: z.enum(['IN_PERSON', 'WHATSAPP', 'ONLINE']).optional(),
  conversationId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'COMPLETED']).optional(),
  paymentState: z.enum(['PAID', 'UNPAID']).optional(),
  lines: z.array(orderLineSchema).min(1),
});

export const createOrderBodySchema = orderFieldsSchema.extend({
  clientId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});

export type OrderFields = z.infer<typeof orderFieldsSchema>;
export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
