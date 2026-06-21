import { prisma } from '../db.js';
import { ValidationError } from '../utils/errors.js';
import type { StockMovement, StockMovementType } from '@prisma/client';

export async function getStockLevel(productId: string): Promise<number> {
  const agg = await prisma.stockMovement.aggregate({
    where: { productId },
    _sum: { qtyDelta: true },
  });
  return agg._sum.qtyDelta ?? 0;
}

export interface AppendMovementInput {
  businessId: string;
  clientId: string;
  productId: string;
  type: StockMovementType;
  qtyDelta: number;
  reason?: string;
  orderId?: string;
  occurredAt?: Date;
}

/** Idempotent append. Returns existing row if clientId already exists for this business. */
export async function appendMovement(input: AppendMovementInput): Promise<{ movement: StockMovement; duplicate: boolean }> {
  const existing = await prisma.stockMovement.findUnique({
    where: { businessId_clientId: { businessId: input.businessId, clientId: input.clientId } },
  });
  if (existing) return { movement: existing, duplicate: true };

  if (input.type === 'ADJUSTMENT' && !input.reason) {
    throw new ValidationError('reason is required for ADJUSTMENT movements');
  }

  const movement = await prisma.stockMovement.create({
    data: {
      businessId: input.businessId,
      clientId: input.clientId,
      productId: input.productId,
      type: input.type,
      qtyDelta: input.qtyDelta,
      reason: input.reason ?? null,
      orderId: input.orderId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });

  return { movement, duplicate: false };
}
