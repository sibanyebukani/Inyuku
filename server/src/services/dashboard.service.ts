import { prisma } from '../db.js';

/** Returns the start/end of today in Africa/Johannesburg (SAST = UTC+2). */
function sastTodayWindow(date?: Date): { start: Date; end: Date } {
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
  const ref = date ?? new Date();
  const sastNow = new Date(ref.getTime() + SAST_OFFSET_MS);

  const y = sastNow.getUTCFullYear();
  const m = sastNow.getUTCMonth();
  const d = sastNow.getUTCDate();

  const start = new Date(Date.UTC(y, m, d) - SAST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d + 1) - SAST_OFFSET_MS);

  return { start, end };
}

export interface DashboardResult {
  ordersTodayCount: number;
  productCount: number;
  lowStockCount: number;
  revenueTodayCents?: number;
}

export async function getDashboard(
  businessId: string,
  opts: { includeFinancial: boolean; date?: Date },
): Promise<DashboardResult> {
  const { start, end } = sastTodayWindow(opts.date);

  const [ordersTodayCount, todayOrders, products] = await Promise.all([
    prisma.order.count({
      where: { businessId, status: 'COMPLETED', occurredAt: { gte: start, lt: end } },
    }),
    opts.includeFinancial
      ? prisma.order.findMany({
          where: { businessId, status: 'COMPLETED', occurredAt: { gte: start, lt: end } },
          select: { totalCents: true },
        })
      : Promise.resolve(null),
    prisma.product.findMany({
      where: { businessId, status: 'ACTIVE' },
      select: { id: true, lowStockThreshold: true },
    }),
  ]);

  const productCount = products.length;

  // Compute stock for each product to determine low-stock count
  let lowStockCount = 0;
  if (products.length > 0) {
    const stockAggs = await prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { businessId, productId: { in: products.map((p) => p.id) } },
      _sum: { qtyDelta: true },
    });

    const stockMap = new Map<string, number>(
      stockAggs.map((a) => [a.productId, a._sum.qtyDelta ?? 0]),
    );

    for (const p of products) {
      const stock = stockMap.get(p.id) ?? 0;
      const threshold = p.lowStockThreshold ?? 5;
      if (stock <= threshold) {
        lowStockCount++;
      }
    }
  }

  const result: DashboardResult = { ordersTodayCount, productCount, lowStockCount };

  if (opts.includeFinancial && todayOrders) {
    result.revenueTodayCents = todayOrders.reduce((sum, o) => sum + o.totalCents, 0);
  }

  return result;
}
