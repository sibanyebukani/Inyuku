import { prisma } from '../db.js';
import { getSetting } from './settings.service.js';

export interface RecordAiUsageInput {
  businessId: string;
  userId?: string;
  feature: string;
  tier: 'classify' | 'agent' | 'complex' | string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheHit?: boolean;
  costCents: number;
  latencyMs?: number;
  requestId?: string;
}

/**
 * Persist an AI usage/cost row. This is the M1-C write-path only;
 * the actual `lib/ai.js` gateway (and real model calls) are M5.
 */
export async function recordAiUsage(input: RecordAiUsageInput) {
  const tokens =
    input.inputTokens != null && input.outputTokens != null
      ? input.inputTokens + input.outputTokens
      : input.inputTokens ?? input.outputTokens ?? null;

  return prisma.aiUsage.create({
    data: {
      businessId: input.businessId,
      userId: input.userId ?? null,
      feature: input.feature,
      tier: input.tier,
      model: input.model,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      tokens,
      costCents: input.costCents,
      cacheHit: input.cacheHit ?? null,
      latencyMs: input.latencyMs ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

/**
 * Read the kill-switch setting. Defaults to false so AI is disabled until
 * explicitly enabled and the gateway is built (M5).
 */
export async function aiEnabled(businessId?: string): Promise<boolean> {
  const raw = await getSetting('ai.enabled', businessId);
  if (raw == null) return false;
  return raw.trim().toLowerCase() === 'true';
}
