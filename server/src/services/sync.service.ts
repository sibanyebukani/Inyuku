import { createProduct, updateProduct } from './product.service.js';
import { appendMovement } from './inventory.service.js';
import { createOrder } from './order.service.js';
import { createCustomer, updateCustomer } from './customer.service.js';
import { hasPermission } from '../auth/permissions.js';
import { prisma } from '../db.js';
import { orderFieldsSchema } from '../schemas/order.schema.js';
import type { Membership } from '@prisma/client';

export type SyncOpStatus = 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';

export interface SyncOp {
  clientId: string;
  entity: 'product' | 'stock_movement' | 'order' | 'customer';
  op: 'create' | 'update';
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface SyncOpResult {
  clientId: string;
  status: SyncOpStatus;
  serverId?: string;
  resource?: string;
  error?: string;
}

export async function applySyncOp(
  op: SyncOp,
  businessId: string,
  membership: Membership,
): Promise<SyncOpResult> {
  const role = membership.role;
  const perms = membership.permissions ?? [];
  const occurredAt = new Date(op.occurredAt);

  try {
    if (op.entity === 'product' && op.op === 'create') {
      if (!hasPermission(role, perms, 'catalog:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const payload = op.payload as {
        name: string;
        sellPriceCents: number;
        costPriceCents?: number;
        lowStockThreshold?: number;
        openingStock?: number;
      };
      const product = await createProduct({
        businessId,
        clientId: op.clientId,
        name: payload.name,
        sellPriceCents: payload.sellPriceCents,
        costPriceCents: payload.costPriceCents,
        lowStockThreshold: payload.lowStockThreshold,
        openingStock: payload.openingStock,
      });
      const wasNew = product.createdAt.getTime() === product.updatedAt.getTime();
      return {
        clientId: op.clientId,
        status: wasNew ? 'APPLIED' : 'DUPLICATE',
        serverId: product.id,
        resource: 'product',
      };
    }

    if (op.entity === 'product' && op.op === 'update') {
      if (!hasPermission(role, perms, 'catalog:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const payload = op.payload as {
        name?: string;
        sellPriceCents?: number;
        costPriceCents?: number;
        lowStockThreshold?: number;
        status?: 'ACTIVE' | 'ARCHIVED';
      };
      const product = await prisma.product.findUnique({
        where: { businessId_clientId: { businessId, clientId: op.clientId } },
      });
      if (!product) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'Product not found' };
      }
      const callerPerms = new Set(perms);
      const { product: updated, conflict } = await updateProduct(
        businessId,
        product.id,
        {
          name: payload.name,
          sellPriceCents: payload.sellPriceCents,
          costPriceCents: payload.costPriceCents,
          lowStockThreshold: payload.lowStockThreshold,
          status: payload.status,
        },
        callerPerms,
        occurredAt,
      );
      return {
        clientId: op.clientId,
        status: conflict ? 'CONFLICT' : 'APPLIED',
        serverId: updated.id,
        resource: 'product',
      };
    }

    if (op.entity === 'stock_movement' && op.op === 'create') {
      if (!hasPermission(role, perms, 'inventory:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const payload = op.payload as {
        productId: string;
        type: 'OPENING' | 'ADJUSTMENT' | 'SALE' | 'SALE_REVERSAL' | 'RECEIVE';
        qtyDelta: number;
        reason?: string;
        orderId?: string;
      };
      const { movement, duplicate } = await appendMovement({
        businessId,
        clientId: op.clientId,
        productId: payload.productId,
        type: payload.type,
        qtyDelta: payload.qtyDelta,
        reason: payload.reason,
        orderId: payload.orderId,
        occurredAt,
      });
      return {
        clientId: op.clientId,
        status: duplicate ? 'DUPLICATE' : 'APPLIED',
        serverId: movement.id,
        resource: 'stock_movement',
      };
    }

    if (op.entity === 'order' && op.op === 'create') {
      if (!hasPermission(role, perms, 'order:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const parsed = orderFieldsSchema.safeParse(op.payload);
      if (!parsed.success) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'VALIDATION' };
      }
      const payload = parsed.data;
      const { order, duplicate } = await createOrder({
        businessId,
        clientId: op.clientId,
        channel: payload.channel,
        conversationId: payload.conversationId,
        customerId: payload.customerId,
        status: payload.status,
        paymentState: payload.paymentState,
        lines: payload.lines,
        occurredAt,
      });
      return {
        clientId: op.clientId,
        status: duplicate ? 'DUPLICATE' : 'APPLIED',
        serverId: order.id,
        resource: 'order',
      };
    }

    if (op.entity === 'customer' && op.op === 'create') {
      if (!hasPermission(role, perms, 'customer:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const payload = op.payload as {
        name: string;
        phone?: string;
        email?: string;
        notes?: string;
      };
      const { customer, duplicate } = await createCustomer({
        businessId,
        clientId: op.clientId,
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        notes: payload.notes,
      });
      return {
        clientId: op.clientId,
        status: duplicate ? 'DUPLICATE' : 'APPLIED',
        serverId: customer.id,
        resource: 'customer',
      };
    }

    if (op.entity === 'customer' && op.op === 'update') {
      if (!hasPermission(role, perms, 'customer:write')) {
        return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
      }
      const payload = op.payload as {
        id?: string;
        name?: string;
        phone?: string;
        email?: string;
        notes?: string;
      };
      // The frontend may not yet know the server id for a customer that was
      // created offline and edited before its first sync. Resolve by clientId
      // in that case, mirroring the product update branch.
      let customerId = payload.id;
      if (!customerId) {
        const existing = await prisma.customer.findUnique({
          where: { businessId_clientId: { businessId, clientId: op.clientId } },
        });
        if (!existing) {
          return { clientId: op.clientId, status: 'REJECTED', error: 'Customer not found' };
        }
        customerId = existing.id;
      }
      const { customer, conflict } = await updateCustomer(
        businessId,
        customerId,
        { name: payload.name, phone: payload.phone, email: payload.email, notes: payload.notes },
        occurredAt,
      );
      return {
        clientId: op.clientId,
        status: conflict ? 'CONFLICT' : 'APPLIED',
        serverId: customer.id,
        resource: 'customer',
      };
    }

    return { clientId: op.clientId, status: 'REJECTED', error: 'Unknown entity/op combination' };
  } catch (err) {
    return {
      clientId: op.clientId,
      status: 'REJECTED',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
