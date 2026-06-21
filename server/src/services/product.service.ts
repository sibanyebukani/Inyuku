import { prisma } from '../db.js';
import { ValidationError } from '../utils/errors.js';
import type { Product, Membership } from '@prisma/client';

export interface CreateProductInput {
  businessId: string;
  clientId: string;
  name: string;
  sellPriceCents: number;
  costPriceCents?: number;
  lowStockThreshold?: number;
  openingStock?: number;
}

export interface UpdateProductInput {
  name?: string;
  sellPriceCents?: number;
  costPriceCents?: number;
  lowStockThreshold?: number;
  status?: 'ACTIVE' | 'ARCHIVED';
}

/** Mask costPriceCents if caller lacks catalog:read_cost. */
export function maskProductCost<T extends { costPriceCents?: number | null }>(
  product: T,
  membership: Membership | undefined,
): Omit<T, 'costPriceCents'> | T {
  const perms = new Set(membership?.permissions ?? []);
  if (!perms.has('catalog:read_cost')) {
    const copy = { ...(product as Record<string, unknown>) };
    delete copy.costPriceCents;
    return copy as Omit<T, 'costPriceCents'>;
  }
  return product;
}

/** Idempotent create. Returns existing row if clientId already exists for this business. */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const existing = await prisma.product.findUnique({
    where: { businessId_clientId: { businessId: input.businessId, clientId: input.clientId } },
  });
  if (existing) return existing;

  return await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        businessId: input.businessId,
        clientId: input.clientId,
        name: input.name,
        sellPriceCents: input.sellPriceCents,
        costPriceCents: input.costPriceCents ?? null,
        lowStockThreshold: input.lowStockThreshold ?? null,
        status: 'ACTIVE',
      },
    });

    if (input.openingStock != null && input.openingStock !== 0) {
      await tx.stockMovement.create({
        data: {
          businessId: input.businessId,
          clientId: `${input.clientId}:opening`,
          productId: product.id,
          type: 'OPENING',
          qtyDelta: input.openingStock,
          occurredAt: new Date(),
        },
      });
    }

    return product;
  });
}

export async function listProducts(businessId: string): Promise<Product[]> {
  return prisma.product.findMany({
    where: { businessId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getProduct(businessId: string, id: string): Promise<Product | null> {
  return prisma.product.findFirst({ where: { id, businessId } });
}

export async function updateProduct(
  businessId: string,
  id: string,
  input: UpdateProductInput,
  callerPerms: Set<string>,
  incomingOccurredAt?: Date,
): Promise<{ product: Product; conflict: boolean }> {
  const product = await prisma.product.findFirst({ where: { id, businessId } });
  if (!product) throw new ValidationError('Product not found');

  // LWW: if incomingOccurredAt is older than the existing updatedAt, it's a conflict
  if (incomingOccurredAt && incomingOccurredAt < product.updatedAt) {
    return { product, conflict: true };
  }

  if (input.costPriceCents !== undefined && !callerPerms.has('catalog:read_cost')) {
    throw new ValidationError('Insufficient permissions to update cost price');
  }

  const data: Partial<UpdateProductInput> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.sellPriceCents !== undefined) data.sellPriceCents = input.sellPriceCents;
  if (input.costPriceCents !== undefined && callerPerms.has('catalog:read_cost')) {
    data.costPriceCents = input.costPriceCents;
  }
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.product.update({ where: { id }, data });
  return { product: updated, conflict: false };
}

export async function archiveProduct(businessId: string, id: string): Promise<Product> {
  const product = await prisma.product.findFirst({ where: { id, businessId } });
  if (!product) throw new ValidationError('Product not found');
  return prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
}

export async function setProductImage(
  businessId: string,
  id: string,
  imageUrl: string,
  imageKey: string,
): Promise<Product> {
  const product = await prisma.product.findFirst({ where: { id, businessId } });
  if (!product) throw new ValidationError('Product not found');
  return prisma.product.update({ where: { id }, data: { imageUrl, imageKey } });
}
