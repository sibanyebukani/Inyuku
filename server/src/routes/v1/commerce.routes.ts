import type { FastifyInstance } from 'fastify';
import '@fastify/multipart';
import { z } from 'zod';
import { auditLog } from '../../utils/audit-logger.js';
import { buildAuditContext } from '../../auth/auth.service.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { effectivePermissions } from '../../auth/permissions.js';
import { putObject, publicUrlFor } from '../../utils/storage.js';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  archiveProduct,
  setProductImage,
  maskProductCost,
} from '../../services/product.service.js';
import {
  getStockLevel,
  appendMovement,
} from '../../services/inventory.service.js';
import {
  createOrder,
  completeOrder,
  voidOrder,
  setPaymentState,
  listOrders,
  getOrder,
} from '../../services/order.service.js';
import {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
} from '../../services/customer.service.js';
import { getDashboard } from '../../services/dashboard.service.js';
import { applySyncOp } from '../../services/sync.service.js';
import { createOrderBodySchema } from '../../schemas/order.schema.js';

type BizParams = { businessId: string };
type IdParams = { businessId: string; id: string };

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateProductBody = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(200),
  sellPriceCents: z.number().int().min(0),
  costPriceCents: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  openingStock: z.number().int().optional(),
});

const UpdateProductBody = z.object({
  name: z.string().min(1).max(200).optional(),
  sellPriceCents: z.number().int().min(0).optional(),
  costPriceCents: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

const CreateMovementBody = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(['OPENING', 'ADJUSTMENT', 'SALE', 'SALE_REVERSAL', 'RECEIVE']),
  qtyDelta: z.number().int(),
  reason: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

const CreateOrderBody = createOrderBodySchema;

const SetPaymentBody = z.object({
  paymentState: z.enum(['PAID', 'UNPAID']),
});

const CreateCustomerBody = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
});

const UpdateCustomerBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

const DashboardQuery = z.object({
  date: z.string().datetime().optional(),
});

const SyncOpSchema = z.object({
  clientId: z.string().min(1),
  entity: z.enum(['product', 'stock_movement', 'order', 'customer']),
  op: z.enum(['create', 'update']),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

const SyncBody = z.object({
  ops: z.array(SyncOpSchema).min(1).max(100),
});

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function commerceRoutes(app: FastifyInstance) {
  // ─── Catalog ────────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/products',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:read' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const products = await listProducts(businessId);
      const perms = effectivePermissions(req.membership!.role, req.membership!.permissions ?? []);
      const masked = products.map((p) =>
        perms.has('catalog:read_cost') ? p : (({ costPriceCents: _, ...rest }) => rest)(p),
      );
      return okEnvelope({ products: masked });
    },
  );

  app.post(
    '/v1/businesses/:businessId/products',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:write' })],
      schema: { body: CreateProductBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateProductBody>;
      const product = await createProduct({ businessId, ...body });
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'product',
        action: 'CREATE',
        entityId: product.id,
        changes: { name: { old: null, new: product.name } },
      });
      const masked = maskProductCost(product, req.membership);
      void reply.code(201);
      return okEnvelope({ product: masked });
    },
  );

  app.get(
    '/v1/businesses/:businessId/products/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:read' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const product = await getProduct(businessId, id);
      if (!product) throw new NotFoundError('Product not found');
      const masked = maskProductCost(product, req.membership);
      return okEnvelope({ product: masked });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/products/:id',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:write' })],
      schema: { body: UpdateProductBody },
    },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const body = req.body as z.infer<typeof UpdateProductBody>;
      const perms = effectivePermissions(req.membership!.role, req.membership!.permissions ?? []);
      if (body.costPriceCents !== undefined && !perms.has('catalog:read_cost')) {
        throw new ForbiddenError('catalog:read_cost required to update cost price');
      }
      const { product } = await updateProduct(businessId, id, body, perms);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'product',
        action: 'UPDATE',
        entityId: product.id,
        changes: { update: { old: null, new: body } },
      });
      return okEnvelope({ product: maskProductCost(product, req.membership) });
    },
  );

  app.delete(
    '/v1/businesses/:businessId/products/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:write' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const product = await archiveProduct(businessId, id);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'product',
        action: 'DELETE',
        entityId: product.id,
        changes: { status: { old: 'ACTIVE', new: 'ARCHIVED' } },
      });
      return okEnvelope({ product });
    },
  );

  app.post(
    '/v1/businesses/:businessId/products/:id/image',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'catalog:write' })] },
    async (req, reply) => {
      const { businessId, id } = req.params as IdParams;
      const product = await getProduct(businessId, id);
      if (!product) throw new NotFoundError('Product not found');

      const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

      const data = await req.file();
      if (!data) {
        void reply.code(400);
        return okEnvelope({ error: 'No file uploaded' });
      }

      if (!ALLOWED_TYPES.includes(data.mimetype)) {
        void reply.code(422);
        return okEnvelope({ error: `Unsupported image type: ${data.mimetype}` });
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += chunk.length;
        if (size > MAX_SIZE) {
          void reply.code(413);
          return okEnvelope({ error: 'Image too large (max 5 MB)' });
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const ext = data.mimetype.split('/')[1];
      const imageKey = `products/${businessId}/${id}.${ext}`;
      const { url } = await putObject(imageKey, buffer, {
        contentType: data.mimetype,
        access: 'public',
      });
      const imageUrl = publicUrlFor(url);
      const updated = await setProductImage(businessId, id, imageUrl, imageKey);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'product',
        action: 'UPDATE',
        entityId: id,
        changes: { imageUrl: { old: product.imageUrl ?? null, new: imageUrl } },
      });
      return okEnvelope({ product: updated, imageUrl });
    },
  );

  // ─── Inventory ───────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/products/:id/stock',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'inventory:read' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const product = await getProduct(businessId, id);
      if (!product) throw new NotFoundError('Product not found');
      const stockLevel = await getStockLevel(id);
      return okEnvelope({ stockLevel, productId: id });
    },
  );

  app.post(
    '/v1/businesses/:businessId/stock-movements',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'inventory:write' })],
      schema: { body: CreateMovementBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateMovementBody>;
      const { movement, duplicate } = await appendMovement({
        businessId,
        clientId: body.clientId,
        productId: body.productId,
        type: body.type,
        qtyDelta: body.qtyDelta,
        reason: body.reason,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      });
      if (!duplicate) {
        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'stock_movement',
          action: 'CREATE',
          entityId: movement.id,
          changes: { type: { old: null, new: movement.type }, qtyDelta: { old: null, new: movement.qtyDelta } },
        });
      }
      void reply.code(duplicate ? 200 : 201);
      return okEnvelope({ movement, duplicate });
    },
  );

  // ─── Orders ──────────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/orders',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'order:read' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const orders = await listOrders(businessId);
      return okEnvelope({ orders });
    },
  );

  app.post(
    '/v1/businesses/:businessId/orders',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'order:write' })],
      schema: { body: CreateOrderBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateOrderBody>;
      const { order, duplicate } = await createOrder({
        businessId,
        clientId: body.clientId,
        customerId: body.customerId,
        conversationId: body.conversationId,
        channel: body.channel,
        status: body.status,
        paymentState: body.paymentState,
        lines: body.lines,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      });
      if (!duplicate) {
        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'order',
          action: 'CREATE',
          entityId: order.id,
          changes: { orderNumber: { old: null, new: order.orderNumber }, totalCents: { old: null, new: order.totalCents } },
        });
      }
      void reply.code(duplicate ? 200 : 201);
      return okEnvelope({ order, duplicate });
    },
  );

  app.get(
    '/v1/businesses/:businessId/orders/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'order:read' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const order = await getOrder(businessId, id);
      if (!order) throw new NotFoundError('Order not found');
      return okEnvelope({ order });
    },
  );

  app.post(
    '/v1/businesses/:businessId/orders/:id/complete',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'order:write' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const order = await completeOrder(businessId, id);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'order',
        action: 'UPDATE',
        entityId: order.id,
        changes: { status: { old: 'DRAFT', new: 'COMPLETED' } },
      });
      return okEnvelope({ order });
    },
  );

  app.post(
    '/v1/businesses/:businessId/orders/:id/void',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'order:write' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const { order, duplicate } = await voidOrder(businessId, id);
      if (!duplicate) {
        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'order',
          action: 'UPDATE',
          entityId: order.id,
          changes: { status: { old: 'COMPLETED', new: 'VOID' } },
        });
      }
      return okEnvelope({ order, duplicate });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/orders/:id/payment',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'order:write' })],
      schema: { body: SetPaymentBody },
    },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const body = req.body as z.infer<typeof SetPaymentBody>;
      const order = await setPaymentState(businessId, id, body.paymentState);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'order',
        action: 'UPDATE',
        entityId: order.id,
        changes: { paymentState: { old: null, new: body.paymentState } },
      });
      return okEnvelope({ order });
    },
  );

  // ─── Customers ───────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/customers',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'customer:read' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const customers = await listCustomers(businessId);
      return okEnvelope({ customers });
    },
  );

  app.post(
    '/v1/businesses/:businessId/customers',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'customer:write' })],
      schema: { body: CreateCustomerBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateCustomerBody>;
      const { customer, duplicate } = await createCustomer({ businessId, ...body });
      if (!duplicate) {
        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'customer',
          action: 'CREATE',
          entityId: customer.id,
          changes: { name: { old: null, new: body.name }, phone: { old: null, new: body.phone ?? null } },
        });
      }
      void reply.code(duplicate ? 200 : 201);
      return okEnvelope({ customer, duplicate });
    },
  );

  app.get(
    '/v1/businesses/:businessId/customers/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'customer:read' })] },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const customer = await getCustomer(businessId, id);
      if (!customer) throw new NotFoundError('Customer not found');
      return okEnvelope({ customer });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/customers/:id',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'customer:write' })],
      schema: { body: UpdateCustomerBody },
    },
    async (req) => {
      const { businessId, id } = req.params as IdParams;
      const body = req.body as z.infer<typeof UpdateCustomerBody>;
      const { name, phone, email, notes, occurredAt: occurredAtStr } = body;
      const { customer, conflict } = await updateCustomer(
        businessId,
        id,
        { name, phone, email, notes },
        occurredAtStr ? new Date(occurredAtStr) : undefined,
      );
      if (!conflict) {
        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'customer',
          action: 'UPDATE',
          entityId: customer.id,
          changes: { update: { old: null, new: body } },
        });
      }
      return okEnvelope({ customer, conflict });
    },
  );

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/dashboard',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'dashboard:read' })],
      schema: { querystring: DashboardQuery },
    },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const query = req.query as z.infer<typeof DashboardQuery>;
      const perms = effectivePermissions(req.membership!.role, req.membership!.permissions ?? []);
      const includeFinancial = perms.has('dashboard:read_financial');
      const result = await getDashboard(businessId, {
        includeFinancial,
        date: query.date ? new Date(query.date) : undefined,
      });
      return okEnvelope(result);
    },
  );

  // ─── Batch Sync ───────────────────────────────────────────────────────────────

  app.post(
    '/v1/businesses/:businessId/sync',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'sync:write' })],
      schema: { body: SyncBody },
    },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const { ops } = req.body as z.infer<typeof SyncBody>;

      const sorted = [...ops].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
      );

      const results = [];
      for (const op of sorted) {
        const result = await applySyncOp(op, businessId, req.membership!);
        results.push(result);
      }

      return okEnvelope({ results, serverTime: new Date().toISOString() });
    },
  );
}
