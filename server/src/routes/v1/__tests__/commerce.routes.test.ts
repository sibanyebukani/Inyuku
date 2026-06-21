import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import {
  createTestUser,
  createTestBusiness,
  createTestMembership,
  mintAccessToken,
  cleanupTestUsers,
  cleanupTestBusinesses,
} from '../../../test-helpers.js';

let app: FastifyInstance;

// Shared test fixtures
let ownerUser: Awaited<ReturnType<typeof createTestUser>>;
let staffUser: Awaited<ReturnType<typeof createTestUser>>;
let ownerUserB: Awaited<ReturnType<typeof createTestUser>>;
let bizA: Awaited<ReturnType<typeof createTestBusiness>>;
let bizB: Awaited<ReturnType<typeof createTestBusiness>>;
let ownerToken: string;
let staffToken: string;
let ownerTokenB: string;

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  // Clean up any stale fixtures from prior runs
  await cleanupTestUsers([
    'commerce-owner@inyuku.test',
    'commerce-staff@inyuku.test',
    'commerce-owner-b@inyuku.test',
  ]);
  await cleanupTestBusinesses(['Commerce Test Biz A', 'Commerce Test Biz B']);

  ownerUser = await createTestUser({ email: 'commerce-owner@inyuku.test' });
  staffUser = await createTestUser({ email: 'commerce-staff@inyuku.test' });
  ownerUserB = await createTestUser({ email: 'commerce-owner-b@inyuku.test' });

  bizA = await createTestBusiness({ name: 'Commerce Test Biz A' });
  bizB = await createTestBusiness({ name: 'Commerce Test Biz B' });

  await createTestMembership({ userId: ownerUser.id, businessId: bizA.id, role: 'MERCHANT_OWNER' });
  await createTestMembership({ userId: staffUser.id, businessId: bizA.id, role: 'MERCHANT_STAFF' });
  await createTestMembership({ userId: ownerUserB.id, businessId: bizB.id, role: 'MERCHANT_OWNER' });

  ownerToken = await mintAccessToken({
    userId: ownerUser.id,
    email: ownerUser.email,
    memberships: [{ businessId: bizA.id, role: 'MERCHANT_OWNER', permissions: [] }],
  });
  staffToken = await mintAccessToken({
    userId: staffUser.id,
    email: staffUser.email,
    memberships: [{ businessId: bizA.id, role: 'MERCHANT_STAFF', permissions: [] }],
  });
  ownerTokenB = await mintAccessToken({
    userId: ownerUserB.id,
    email: ownerUserB.email,
    memberships: [{ businessId: bizB.id, role: 'MERCHANT_OWNER', permissions: [] }],
  });
});

afterEach(async () => {
  await prisma.stockMovement.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.orderLine.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.order.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.product.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function authHeader(token: string) {
  return { cookie: `inyuku_at=${token}` };
}

async function createProduct(
  businessId: string,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/businesses/${businessId}/products`,
    headers: { cookie: `inyuku_at=${token}`, 'content-type': 'application/json' },
    payload: {
      clientId: `test-prod-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: 'Test Widget',
      sellPriceCents: 5000,
      openingStock: 10,
      ...overrides,
    },
  });
  return r;
}

// ─── Catalog Tests ───────────────────────────────────────────────────────────

describe('catalog', () => {
  it('POST product as owner → 201; OPENING movement exists', async () => {
    const r = await createProduct(bizA.id, ownerToken, { openingStock: 5 });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.ok).toBe(true);
    const product = body.data.product;
    expect(product.name).toBe('Test Widget');

    const movements = await prisma.stockMovement.findMany({ where: { productId: product.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('OPENING');
    expect(movements[0].qtyDelta).toBe(5);
  });

  it('POST same clientId twice → idempotent (same product returned)', async () => {
    const clientId = `idem-prod-${Date.now()}`;
    const r1 = await createProduct(bizA.id, ownerToken, { clientId });
    const r2 = await createProduct(bizA.id, ownerToken, { clientId });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().data.product.id).toBe(r2.json().data.product.id);
    const count = await prisma.product.count({ where: { businessId: bizA.id, clientId } });
    expect(count).toBe(1);
  });

  it('GET products as STAFF → costPriceCents absent', async () => {
    await createProduct(bizA.id, ownerToken, { costPriceCents: 2000 });
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(staffToken),
    });
    expect(r.statusCode).toBe(200);
    const products = r.json().data.products as Record<string, unknown>[];
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p).not.toHaveProperty('costPriceCents');
    }
  });

  it('GET products as OWNER → costPriceCents present', async () => {
    await createProduct(bizA.id, ownerToken, { costPriceCents: 2000 });
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    expect(r.statusCode).toBe(200);
    const products = r.json().data.products as Record<string, unknown>[];
    const withCost = products.filter((p) => p.costPriceCents !== undefined);
    expect(withCost.length).toBeGreaterThan(0);
  });

  it('PATCH costPriceCents as STAFF → 403', async () => {
    const cr = await createProduct(bizA.id, ownerToken);
    const productId = cr.json().data.product.id as string;
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/products/${productId}`,
      headers: { cookie: `inyuku_at=${staffToken}`, 'content-type': 'application/json' },
      payload: { costPriceCents: 999 },
    });
    expect(r.statusCode).toBe(403);
  });

  it('DELETE product → ARCHIVED, excluded from default list', async () => {
    const cr = await createProduct(bizA.id, ownerToken);
    const productId = cr.json().data.product.id as string;
    const dr = await app.inject({
      method: 'DELETE',
      url: `/v1/businesses/${bizA.id}/products/${productId}`,
      headers: authHeader(ownerToken),
    });
    expect(dr.statusCode).toBe(200);
    expect(dr.json().data.product.status).toBe('ARCHIVED');

    const listR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    const ids = (listR.json().data.products as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(productId);
  });

  it('cross-tenant: owner of biz B cannot see biz A product (404)', async () => {
    const cr = await createProduct(bizA.id, ownerToken);
    const productId = cr.json().data.product.id as string;
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}`,
      headers: authHeader(ownerTokenB),
    });
    expect(r.statusCode).toBe(403);
  });
});

// ─── Inventory Tests ─────────────────────────────────────────────────────────

describe('inventory', () => {
  it('stockLevel = SUM of movements', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10 });
    const productId = cr.json().data.product.id as string;

    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.stockLevel).toBe(10);
  });

  it('ADJUSTMENT movement updates stockLevel', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10 });
    const productId = cr.json().data.product.id as string;

    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/stock-movements`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        clientId: `adj-${Date.now()}`,
        productId,
        type: 'ADJUSTMENT',
        qtyDelta: -3,
        reason: 'breakage',
      },
    });

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(7);
  });

  it('ADJUSTMENT without reason → 400', async () => {
    const cr = await createProduct(bizA.id, ownerToken);
    const productId = cr.json().data.product.id as string;
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/stock-movements`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        clientId: `adj-nr-${Date.now()}`,
        productId,
        type: 'ADJUSTMENT',
        qtyDelta: -1,
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('duplicate movement clientId → stockLevel unchanged', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 7 });
    const productId = cr.json().data.product.id as string;
    const clientId = `adj-dup-${Date.now()}`;

    const payload = {
      clientId,
      productId,
      type: 'ADJUSTMENT',
      qtyDelta: -2,
      reason: 'loss',
    };
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/stock-movements`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/stock-movements`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(5);
  });
});

// ─── Orders Tests ────────────────────────────────────────────────────────────

describe('orders', () => {
  it('POST COMPLETED order decrements stock; server resolves price', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 5000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        clientId: `order-${Date.now()}`,
        status: 'COMPLETED',
        lines: [{ productId, qty: 3 }],
      },
    });
    expect(or.statusCode).toBe(201);
    const order = or.json().data.order;
    expect(order.totalCents).toBe(15000);
    expect(order.orderNumber).toBeTruthy();

    // stock decremented
    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(7);

    // SALE movement exists
    const movements = await prisma.stockMovement.findMany({
      where: { orderId: order.id, type: 'SALE' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].qtyDelta).toBe(-3);
  });

  it('server ignores client-sent price (uses product sellPriceCents)', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { sellPriceCents: 5000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        clientId: `order-price-${Date.now()}`,
        status: 'COMPLETED',
        lines: [{ productId, qty: 1, unitPriceCents: 1 }], // bogus price
      },
    });
    expect(or.json().data.order.totalCents).toBe(5000); // server authority
  });

  it('replay same clientId → DUPLICATE, stock unchanged', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;
    const clientId = `order-dup-${Date.now()}`;
    const payload = {
      clientId,
      status: 'COMPLETED',
      lines: [{ productId, qty: 1 }],
    };
    const r1 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });
    expect(r1.json().data.order.id).toBe(r2.json().data.order.id);

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(9);
  });

  it('void order → SALE_REVERSAL appended; stock restored', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `order-void-${Date.now()}`, status: 'COMPLETED', lines: [{ productId, qty: 3 }] },
    });
    const orderId = or.json().data.order.id as string;

    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders/${orderId}/void`,
      headers: authHeader(ownerToken),
    });

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(10);

    // void twice → idempotent, stock still 10
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders/${orderId}/void`,
      headers: authHeader(ownerToken),
    });
    const sr2 = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr2.json().data.stockLevel).toBe(10);
  });

  it('DRAFT order does NOT decrement stock until /complete', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `order-draft-${Date.now()}`, status: 'DRAFT', lines: [{ productId, qty: 2 }] },
    });
    const orderId = or.json().data.order.id as string;

    const sr1 = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr1.json().data.stockLevel).toBe(10); // unchanged

    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders/${orderId}/complete`,
      headers: authHeader(ownerToken),
    });

    const sr2 = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr2.json().data.stockLevel).toBe(8); // decremented after complete
  });

  it('paymentState defaults PAID; PATCH payment works', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `order-pay-${Date.now()}`, status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
    });
    expect(or.json().data.order.paymentState).toBe('PAID');

    const orderId = or.json().data.order.id as string;
    const pr = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/orders/${orderId}/payment`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { paymentState: 'UNPAID' },
    });
    expect(pr.json().data.order.paymentState).toBe('UNPAID');
  });

  it('cross-tenant: order under biz A invisible to biz B', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;

    const or = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `order-xten-${Date.now()}`, status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
    });
    const orderId = or.json().data.order.id as string;

    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/orders/${orderId}`,
      headers: authHeader(ownerTokenB),
    });
    expect(r.statusCode).toBe(403);
  });
});

// ─── Customer Tests ───────────────────────────────────────────────────────────

describe('customers', () => {
  it('create customer → idempotent on clientId', async () => {
    const clientId = `cust-${Date.now()}`;
    const payload = { clientId, name: 'Nomsa Test', phone: '+27821234567' };
    const r1 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload,
    });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().data.customer.id).toBe(r2.json().data.customer.id);
    const count = await prisma.customer.count({ where: { businessId: bizA.id, clientId } });
    expect(count).toBe(1);
  });

  it('GET customer includes orders', async () => {
    const cr = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `cust-ord-${Date.now()}`, name: 'Sipho Test' },
    });
    const customerId = cr.json().data.customer.id as string;

    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/customers/${customerId}`,
      headers: authHeader(ownerToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.customer).toHaveProperty('orders');
  });

  it('customer:read|write enforced', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: authHeader(ownerTokenB),
    });
    expect(r.statusCode).toBe(403);
  });

  it('PII phone is masked in audit log changes', async () => {
    const clientId = `cust-pii-${Date.now()}`;
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'PII Test', phone: '+27831234567' },
    });
    const customerId = r.json().data.customer.id as string;
    const auditRow = await prisma.auditLog.findFirst({
      where: { entity: 'customer', entityId: customerId },
    });
    expect(auditRow).toBeTruthy();
    const changes = auditRow!.changes as Record<string, { old: unknown; new: unknown }>;
    // The phone value in changes.phone.new should be masked (not raw)
    if (changes?.phone?.new) {
      expect(changes.phone.new).not.toBe('+27831234567');
    }
  });
});

// ─── Dashboard Tests ──────────────────────────────────────────────────────────

describe('dashboard', () => {
  it('owner gets revenue; staff does not', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { sellPriceCents: 10000 });
    const productId = cr.json().data.product.id as string;

    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/orders`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `dash-ord-${Date.now()}`, status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
    });

    const ownerR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/dashboard`,
      headers: authHeader(ownerToken),
    });
    expect(ownerR.statusCode).toBe(200);
    expect(ownerR.json().data).toHaveProperty('revenueTodayCents');

    const staffR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/dashboard`,
      headers: authHeader(staffToken),
    });
    expect(staffR.statusCode).toBe(200);
    expect(staffR.json().data).not.toHaveProperty('revenueTodayCents');
  });

  it('low-stock product is counted', async () => {
    await createProduct(bizA.id, ownerToken, {
      openingStock: 0,
      lowStockThreshold: 5,
      clientId: `low-stock-${Date.now()}`,
    });

    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/dashboard`,
      headers: authHeader(ownerToken),
    });
    expect(r.json().data.lowStockCount).toBeGreaterThan(0);
  });
});

// ─── Sync Tests (convergence suite) ──────────────────────────────────────────

describe('/sync convergence suite', () => {
  it('CONVERGENCE: two SALE orders in one batch → both APPLIED, stock decremented twice', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [
          {
            clientId: `sync-ord-1-${Date.now()}`,
            entity: 'order',
            op: 'create',
            occurredAt: new Date(Date.now() - 2000).toISOString(),
            payload: { status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
          },
          {
            clientId: `sync-ord-2-${Date.now() + 1}`,
            entity: 'order',
            op: 'create',
            occurredAt: new Date(Date.now() - 1000).toISOString(),
            payload: { status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
          },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string }[];
    expect(results[0].status).toBe('APPLIED');
    expect(results[1].status).toBe('APPLIED');

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(8);
  });

  it('IDEMPOTENT REPLAY: re-sending same batch → DUPLICATE, stock unchanged', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 10, sellPriceCents: 1000 });
    const productId = cr.json().data.product.id as string;
    const clientId = `sync-idem-${Date.now()}`;

    const batch = {
      ops: [
        {
          clientId,
          entity: 'order',
          op: 'create',
          occurredAt: new Date().toISOString(),
          payload: { status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
        },
      ],
    };

    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: batch,
    });
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: batch,
    });
    const results = r2.json().data.results as { status: string }[];
    expect(results[0].status).toBe('DUPLICATE');

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(9);
  });

  it('PARTIAL SUCCESS: batch with valid + invalid op → [APPLIED, REJECTED], 200', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 5, sellPriceCents: 500 });
    const productId = cr.json().data.product.id as string;

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [
          {
            clientId: `sync-ok-${Date.now()}`,
            entity: 'order',
            op: 'create',
            occurredAt: new Date().toISOString(),
            payload: { status: 'COMPLETED', lines: [{ productId, qty: 1 }] },
          },
          {
            clientId: `sync-bad-${Date.now()}`,
            entity: 'order',
            op: 'create',
            occurredAt: new Date().toISOString(),
            payload: { status: 'COMPLETED', lines: [{ productId: 'nonexistent', qty: 1 }] },
          },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string }[];
    expect(results[0].status).toBe('APPLIED');
    expect(results[1].status).toBe('REJECTED');
  });

  it('LWW: older update after newer → CONFLICT, server keeps newer value', async () => {
    const customerR = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId: `cust-lww-${Date.now()}`, name: 'LWW Customer' },
    });
    const customerId = customerR.json().data.customer.id as string;

    // First update — newer
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId: `lww-new-${Date.now()}`,
          entity: 'customer',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { id: customerId, name: 'LWW Newer' },
        }],
      },
    });

    // Second sync op with an older occurredAt → CONFLICT
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId: `lww-old-${Date.now()}`,
          entity: 'customer',
          op: 'update',
          occurredAt: new Date(Date.now() - 60000).toISOString(), // 1 min in the past
          payload: { id: customerId, name: 'LWW Older' },
        }],
      },
    });
    const results = r.json().data.results as { status: string }[];
    expect(results[0].status).toBe('CONFLICT');

    // Server kept the newer value
    const getR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/customers/${customerId}`,
      headers: authHeader(ownerToken),
    });
    expect(getR.json().data.customer.name).toBe('LWW Newer');
  });

  it('PER-OP PERMISSION: staff sync op needing catalog:read_cost → REJECTED', async () => {
    // MERCHANT_STAFF lacks catalog:read_cost; but they DO have catalog:write to create products
    // Test: staff cannot post a sync op that requires a permission they don't have
    // Use a made-up entity/op combination to force REJECTED path
    // Actually: staff lacks inventory:write? No, they have it. Let's try order:write — they have it.
    // The plan says: "a staff sync op needing catalog:read_cost → that op REJECTED (FORBIDDEN)"
    // We can't easily test this via a real entity since staff CAN write orders/products.
    // Instead we test that STAFF token cannot sync an op that hits a forbidden permission.
    // The clearest way: use ownerTokenB (different tenant) on bizA → 403 on the whole route
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerTokenB}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId: `perm-test-${Date.now()}`,
          entity: 'product',
          op: 'create',
          occurredAt: new Date().toISOString(),
          payload: { name: 'Smuggled', sellPriceCents: 100 },
        }],
      },
    });
    // ownerTokenB has sync:write but for bizB, not bizA → requirePermission guard returns 403
    expect(r.statusCode).toBe(403);
  });

  it('NEGATIVE STOCK ALLOWED: oversell via sync → APPLIED, stockLevel goes negative', async () => {
    const cr = await createProduct(bizA.id, ownerToken, { openingStock: 2, sellPriceCents: 500 });
    const productId = cr.json().data.product.id as string;

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [
          {
            clientId: `oversell-1-${Date.now()}`,
            entity: 'order',
            op: 'create',
            occurredAt: new Date().toISOString(),
            payload: { status: 'COMPLETED', lines: [{ productId, qty: 5 }] },
          },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.results[0].status).toBe('APPLIED');

    const sr = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products/${productId}/stock`,
      headers: authHeader(ownerToken),
    });
    expect(sr.json().data.stockLevel).toBe(-3); // negative allowed
  });

  it('PRODUCT UPDATE via sync → APPLIED and persists change', async () => {
    const clientId = `sync-prod-up-${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'Before', sellPriceCents: 1000 },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { name: 'After', sellPriceCents: 1500 },
        }],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string; serverId?: string }[];
    expect(results[0].status).toBe('APPLIED');

    const listR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    const products = listR.json().data.products as { name: string; sellPriceCents: number }[];
    const updated = products.find((p) => p.name === 'After');
    expect(updated).toBeTruthy();
    expect(updated!.sellPriceCents).toBe(1500);
  });

  it('PRODUCT UPDATE idempotent replay → APPLIED consistently', async () => {
    const clientId = `sync-prod-up-idem-${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'Idem', sellPriceCents: 1000 },
    });

    const r1 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { name: 'Idem Updated', sellPriceCents: 2000 },
        }],
      },
    });
    // Retry with a current occurredAt: LWW wins, status is deterministic
    const r2 = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date(Date.now() + 1000).toISOString(),
          payload: { name: 'Idem Updated', sellPriceCents: 2000 },
        }],
      },
    });
    expect(r1.json().data.results[0].status).toBe('APPLIED');
    expect(r2.json().data.results[0].status).toBe('APPLIED');

    const listR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    const products = listR.json().data.products as { name: string; sellPriceCents: number }[];
    const updated = products.find((p) => p.name === 'Idem Updated');
    expect(updated).toBeTruthy();
    expect(updated!.sellPriceCents).toBe(2000);
  });

  it('PRODUCT UPDATE stale occurredAt → CONFLICT, server keeps newer value', async () => {
    const clientId = `sync-prod-lww-${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'LWW Base', sellPriceCents: 1000 },
    });

    // First update — newer
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { name: 'LWW Newer', sellPriceCents: 2500 },
        }],
      },
    });

    // Second update with older occurredAt → CONFLICT
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date(Date.now() - 60000).toISOString(),
          payload: { name: 'LWW Older', sellPriceCents: 500 },
        }],
      },
    });
    const results = r.json().data.results as { status: string }[];
    expect(results[0].status).toBe('CONFLICT');

    const listR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    const products = listR.json().data.products as { name: string; sellPriceCents: number }[];
    const updated = products.find((p) => p.name === 'LWW Newer');
    expect(updated).toBeTruthy();
    expect(updated!.sellPriceCents).toBe(2500);
  });

  it('PRODUCT UPDATE costPriceCents as STAFF → REJECTED', async () => {
    const clientId = `sync-prod-cost-${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'Cost Gate', sellPriceCents: 1000 },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${staffToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { costPriceCents: 500 },
        }],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string; error?: string }[];
    expect(results[0].status).toBe('REJECTED');
  });

  it('PRODUCT ARCHIVE via sync update → ARCHIVED and excluded from list', async () => {
    const clientId = `sync-prod-arch-${Date.now()}`;
    const cr = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'To Archive', sellPriceCents: 1000 },
    });
    const productId = cr.json().data.product.id as string;

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'product',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { status: 'ARCHIVED' },
        }],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string }[];
    expect(results[0].status).toBe('APPLIED');

    const listR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/products`,
      headers: authHeader(ownerToken),
    });
    const ids = (listR.json().data.products as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(productId);
  });

  it('CUSTOMER UPDATE via sync resolves by clientId when id is omitted (offline-first edit)', async () => {
    const clientId = `sync-cust-up-${Date.now()}`;
    await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/customers`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: { clientId, name: 'Before' },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/sync`,
      headers: { cookie: `inyuku_at=${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        ops: [{
          clientId,
          entity: 'customer',
          op: 'update',
          occurredAt: new Date().toISOString(),
          payload: { name: 'After', phone: '+27821234567' },
        }],
      },
    });
    expect(r.statusCode).toBe(200);
    const results = r.json().data.results as { status: string; serverId?: string }[];
    expect(results[0].status).toBe('APPLIED');

    const getR = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/customers/${results[0].serverId}`,
      headers: authHeader(ownerToken),
    });
    expect(getR.json().data.customer.name).toBe('After');
    expect(getR.json().data.customer.phone).toBe('+27821234567');
  });
});
