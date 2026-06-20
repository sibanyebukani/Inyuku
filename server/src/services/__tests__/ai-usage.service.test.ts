import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { prisma } from '../../db.js';
import { recordAiUsage, aiEnabled } from '../ai-usage.service.js';
import { setSetting } from '../settings.service.js';

const PLATFORM_BUSINESS_ID = 'platform';

async function ensureBusiness(id: string, name: string) {
  return prisma.business.upsert({
    where: { id },
    create: { id, name, slug: id },
    update: {},
  });
}

describe('ai-usage service', () => {
  beforeAll(async () => {
    await ensureBusiness(PLATFORM_BUSINESS_ID, 'Inyuku Platform');
    await ensureBusiness('ai-usage-test-biz', 'AI Usage Test Business');
  });

  afterEach(async () => {
    await prisma.aiUsage.deleteMany({
      where: { businessId: { in: [PLATFORM_BUSINESS_ID, 'ai-usage-test-biz'] } },
    });
    await setSetting('ai.enabled', 'false', { businessId: 'ai-usage-test-biz' });
  });

  it('records an AiUsage row with integer costCents', async () => {
    const row = await recordAiUsage({
      businessId: 'ai-usage-test-biz',
      userId: undefined,
      feature: 'test-feature',
      tier: 'classify',
      model: 'claude-3-haiku',
      inputTokens: 100,
      outputTokens: 50,
      cacheHit: false,
      costCents: 123,
      latencyMs: 456,
      requestId: 'req-abc',
    });

    expect(row.businessId).toBe('ai-usage-test-biz');
    expect(row.feature).toBe('test-feature');
    expect(row.tier).toBe('classify');
    expect(row.costCents).toBe(123);
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.tokens).toBe(150);
    expect(row.requestId).toBe('req-abc');
  });

  it('reads ai.enabled as a kill switch', async () => {
    expect(await aiEnabled('ai-usage-test-biz')).toBe(false);
    await setSetting('ai.enabled', 'true', { businessId: 'ai-usage-test-biz' });
    expect(await aiEnabled('ai-usage-test-biz')).toBe(true);
  });
});
