import { describe, it, expect } from 'vitest';
import { orderFieldsSchema, createOrderBodySchema } from '../order.schema.js';

describe('orderFieldsSchema', () => {
  it('accepts a minimal valid order', () => {
    const r = orderFieldsSchema.safeParse({ lines: [{ productId: 'p1', qty: 2 }] });
    expect(r.success).toBe(true);
  });
  it('accepts channel + conversationId', () => {
    const r = orderFieldsSchema.safeParse({
      channel: 'WHATSAPP',
      conversationId: 'conv1',
      lines: [{ productId: 'p1', qty: 1 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown channel', () => {
    const r = orderFieldsSchema.safeParse({ channel: 'CARRIER_PIGEON', lines: [{ productId: 'p1', qty: 1 }] });
    expect(r.success).toBe(false);
  });
  it('rejects empty lines', () => {
    expect(orderFieldsSchema.safeParse({ lines: [] }).success).toBe(false);
  });
  it('rejects qty < 1', () => {
    expect(orderFieldsSchema.safeParse({ lines: [{ productId: 'p1', qty: 0 }] }).success).toBe(false);
  });
});

describe('createOrderBodySchema', () => {
  it('requires clientId', () => {
    expect(createOrderBodySchema.safeParse({ lines: [{ productId: 'p1', qty: 1 }] }).success).toBe(false);
  });
  it('accepts clientId + optional occurredAt + channel', () => {
    const r = createOrderBodySchema.safeParse({
      clientId: 'c1',
      channel: 'WHATSAPP',
      conversationId: 'conv1',
      occurredAt: '2026-06-23T10:00:00.000Z',
      lines: [{ productId: 'p1', qty: 1 }],
    });
    expect(r.success).toBe(true);
  });
});
