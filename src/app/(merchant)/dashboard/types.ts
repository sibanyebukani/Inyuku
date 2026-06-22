export interface DashboardSnapshot {
  ordersTodayCount: number;
  productCount: number;
  lowStockCount: number;
  revenueTodayCents?: number;
  fetchedAt: string;
}
