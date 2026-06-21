import { describe, it, expect } from 'vitest';
import { prisma } from '../db.js';

describe('M2 schema models present', () => {
  it('product model exists', () => {
    expect(prisma.product).toBeDefined();
  });

  it('stockMovement model exists', () => {
    expect(prisma.stockMovement).toBeDefined();
  });

  it('order model exists', () => {
    expect(prisma.order).toBeDefined();
  });

  it('orderLine model exists', () => {
    expect(prisma.orderLine).toBeDefined();
  });

  it('customer model exists', () => {
    expect(prisma.customer).toBeDefined();
  });

  it('analyticsEvent model exists', () => {
    expect(prisma.analyticsEvent).toBeDefined();
  });
});
