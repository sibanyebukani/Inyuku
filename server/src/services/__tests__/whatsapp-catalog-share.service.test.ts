import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../db.js';
import { composeCatalogText } from '../whatsapp-catalog-share.service.js';
import { createTestBusiness } from '../../test-helpers.js';

describe('composeCatalogText', () => {
  let biz: { id: string };
  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'Catalog Share Biz' });
    // in-stock product
    const p1 = await prisma.product.create({ data: { businessId: biz.id, clientId: `p1-${Date.now()}`, name: 'Maize Meal', sellPriceCents: 4999, costPriceCents: 3000, status: 'ACTIVE' } });
    await prisma.stockMovement.create({ data: { businessId: biz.id, clientId: `m1-${Date.now()}`, productId: p1.id, type: 'OPENING', qtyDelta: 10, occurredAt: new Date() } });
    // out-of-stock product (no movements -> sum 0)
    await prisma.product.create({ data: { businessId: biz.id, clientId: `p2-${Date.now()}`, name: 'Sugar 2kg', sellPriceCents: 2550, costPriceCents: 1500, status: 'ACTIVE' } });
    // archived product (excluded)
    await prisma.product.create({ data: { businessId: biz.id, clientId: `p3-${Date.now()}`, name: 'Old SKU', sellPriceCents: 100, status: 'ARCHIVED' } });
  });

  it('formats ZAR, includes out-of-stock flagged, excludes archived, never shows cost', async () => {
    const text = await composeCatalogText(biz.id);
    expect(text).toContain('Maize Meal — R49.99');
    expect(text).toContain('Sugar 2kg — R25.50 (out of stock)');
    expect(text).not.toContain('Old SKU');
    // cost values must never appear
    expect(text).not.toContain('30.00');
    expect(text).not.toContain('15.00');
    expect(text).not.toContain('3000');
    expect(text).not.toContain('1500');
  });
});
