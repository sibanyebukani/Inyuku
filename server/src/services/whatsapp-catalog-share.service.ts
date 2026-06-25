import { prisma } from '../db.js';

function formatZar(cents: number): string {
  const rands = Math.floor(cents / 100);
  const cc = String(cents % 100).padStart(2, '0');
  return `R${rands}.${cc}`;
}

/** Plain-text catalog for WhatsApp. ACTIVE only; out-of-stock included+flagged; cost NEVER read. */
export async function composeCatalogText(businessId: string, productIds?: string[]): Promise<string> {
  const products = await prisma.product.findMany({
    where: {
      businessId,
      status: 'ACTIVE',
      ...(productIds && productIds.length ? { id: { in: productIds } } : {}),
    },
    // explicit select: cost is intentionally NOT selected (Condition 2)
    select: { id: true, name: true, sellPriceCents: true },
    orderBy: { createdAt: 'asc' },
  });
  if (products.length === 0) return 'No products available.';

  const stock = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { businessId, productId: { in: products.map((p) => p.id) } },
    _sum: { qtyDelta: true },
  });
  const stockByProduct = new Map(stock.map((s) => [s.productId, s._sum.qtyDelta ?? 0]));

  const lines = products.map((p) => {
    const qty = stockByProduct.get(p.id) ?? 0;
    const flag = qty <= 0 ? ' (out of stock)' : '';
    return `• ${p.name} — ${formatZar(p.sellPriceCents)}${flag}`;
  });
  return lines.join('\n');
}
