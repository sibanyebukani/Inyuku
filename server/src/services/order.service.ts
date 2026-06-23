import { prisma } from '../db.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { normalizeMsisdn, maskMsisdn } from '../utils/phone.js';
import type { Order, OrderLine } from '@prisma/client';

export interface CreateOrderLineInput {
  productId: string;
  qty: number;
}

export interface CreateOrderInput {
  businessId: string;
  clientId: string;
  customerId?: string;
  conversationId?: string;
  status?: 'DRAFT' | 'COMPLETED';
  channel?: 'IN_PERSON' | 'WHATSAPP' | 'ONLINE';
  paymentState?: 'PAID' | 'UNPAID';
  lines: CreateOrderLineInput[];
  occurredAt?: Date;
}

export type OrderWithLines = Order & { lines: OrderLine[] };

async function resolveCustomerFromConversation(
  tx: Prisma.TransactionClient,
  businessId: string,
  conversationId: string,
): Promise<string | null> {
  const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.businessId !== businessId) return null; // already tenant-checked upstream; defensive
  if (conv.customerId) return conv.customerId;

  const normalized = normalizeMsisdn(conv.waContactId);
  // try match by normalised phone within the tenant
  const candidates = await tx.customer.findMany({ where: { businessId, phone: { not: null } } });
  const match = candidates.find((c) => c.phone && normalizeMsisdn(c.phone) === normalized);
  let customerId: string;
  if (match) {
    customerId = match.id;
  } else {
    const created = await tx.customer.create({
      data: {
        businessId,
        clientId: `wa:${conversationId}`,
        name: `WhatsApp ${maskMsisdn(conv.waContactId)}`,
        phone: conv.waContactId,
        consentId: null,
      },
    });
    customerId = created.id;
  }
  if (!conv.customerId) {
    await tx.conversation.update({ where: { id: conversationId }, data: { customerId } });
  }
  return customerId;
}

async function nextOrderNumber(businessId: string, tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.order.count({ where: { businessId } });
  return String(count + 1).padStart(4, '0');
}

/** Idempotent create. Returns existing order if clientId already exists. */
export async function createOrder(input: CreateOrderInput): Promise<{ order: OrderWithLines; duplicate: boolean }> {
  const existing = await prisma.order.findUnique({
    where: { businessId_clientId: { businessId: input.businessId, clientId: input.clientId } },
    include: { lines: true },
  });
  if (existing) return { order: existing, duplicate: true };

  if (input.conversationId) {
    const conv = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || conv.businessId !== input.businessId) {
      throw new NotFoundError('Conversation not found');
    }
  }
  if (input.customerId) {
    const cust = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!cust || cust.businessId !== input.businessId) {
      throw new NotFoundError('Customer not found');
    }
  }

  const status = input.status ?? 'DRAFT';
  const occurredAt = input.occurredAt ?? new Date();

  return await prisma.$transaction(async (tx) => {
    let resolvedCustomerId = input.customerId ?? null;
    if (!resolvedCustomerId && input.conversationId) {
      resolvedCustomerId = await resolveCustomerFromConversation(tx, input.businessId, input.conversationId);
    }

    const orderNumber = await nextOrderNumber(input.businessId, tx);

    let subtotalCents = 0;
    const lineData: {
      businessId: string;
      productId: string | null;
      nameSnapshot: string;
      unitPriceCents: number;
      qty: number;
      lineTotalCents: number;
    }[] = [];

    for (const lineInput of input.lines) {
      const product = await tx.product.findFirst({
        where: { id: lineInput.productId, businessId: input.businessId },
      });
      if (!product) throw new ValidationError(`Product ${lineInput.productId} not found`);
      const lineTotal = product.sellPriceCents * lineInput.qty;
      subtotalCents += lineTotal;
      lineData.push({
        businessId: input.businessId,
        productId: product.id,
        nameSnapshot: product.name,
        unitPriceCents: product.sellPriceCents,
        qty: lineInput.qty,
        lineTotalCents: lineTotal,
      });
    }

    const order = await tx.order.create({
      data: {
        businessId: input.businessId,
        clientId: input.clientId,
        orderNumber,
        customerId: resolvedCustomerId,
        conversationId: input.conversationId ?? null,
        status,
        channel: input.channel ?? 'IN_PERSON',
        paymentState: input.paymentState ?? 'PAID',
        subtotalCents,
        totalCents: subtotalCents,
        occurredAt,
        lines: { create: lineData },
      },
      include: { lines: true },
    });

    if (status === 'COMPLETED') {
      await appendSaleMovements(tx, order.id, input.businessId, order.lines, occurredAt);
    }

    return { order, duplicate: false };
  });
}

async function appendSaleMovements(
  tx: Prisma.TransactionClient,
  orderId: string,
  businessId: string,
  lines: OrderLine[],
  occurredAt: Date,
) {
  for (const line of lines) {
    if (!line.productId) continue;
    await tx.stockMovement.create({
      data: {
        businessId,
        clientId: `${orderId}:sale:${line.productId}`,
        productId: line.productId,
        type: 'SALE',
        qtyDelta: -line.qty,
        orderId,
        occurredAt,
      },
    });
  }
}

export async function completeOrder(businessId: string, orderId: string): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { lines: true },
  });
  if (!order) throw new ValidationError('Order not found');
  if (order.status !== 'DRAFT') throw new ValidationError(`Order is already ${order.status}`);

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
    });
    await appendSaleMovements(tx, orderId, businessId, (order as OrderWithLines).lines, order.occurredAt);
    return updated;
  });
}

export async function voidOrder(businessId: string, orderId: string): Promise<{ order: Order; duplicate: boolean }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { lines: true },
  });
  if (!order) throw new ValidationError('Order not found');

  if (order.status === 'VOID') return { order, duplicate: true };

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'VOID' },
    });

    if (order.status === 'COMPLETED') {
      for (const line of (order as OrderWithLines).lines) {
        if (!line.productId) continue;
        const reversalClientId = `${orderId}:reversal:${line.productId}`;
        const dup = await tx.stockMovement.findUnique({
          where: { businessId_clientId: { businessId, clientId: reversalClientId } },
        });
        if (!dup) {
          await tx.stockMovement.create({
            data: {
              businessId,
              clientId: reversalClientId,
              productId: line.productId,
              type: 'SALE_REVERSAL',
              qtyDelta: line.qty,
              orderId,
              occurredAt: new Date(),
            },
          });
        }
      }
    }

    return { order: updated, duplicate: false };
  });
}

export async function setPaymentState(
  businessId: string,
  orderId: string,
  paymentState: 'PAID' | 'UNPAID',
): Promise<Order> {
  const order = await prisma.order.findFirst({ where: { id: orderId, businessId } });
  if (!order) throw new ValidationError('Order not found');
  return prisma.order.update({ where: { id: orderId }, data: { paymentState } });
}

export async function listOrders(businessId: string): Promise<Order[]> {
  return prisma.order.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    include: { lines: true },
  });
}

export async function getOrder(businessId: string, orderId: string): Promise<OrderWithLines | null> {
  return prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { lines: true },
  }) as Promise<OrderWithLines | null>;
}
