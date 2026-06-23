import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Condition 6c: auto-reply module is provably non-AI', () => {
  it('does not reference lib/ai or the Anthropic SDK', () => {
    const src = readFileSync(resolve(__dirname, '../whatsapp-autoreply.service.ts'), 'utf8');
    expect(src).not.toMatch(/lib\/ai/);
    expect(src).not.toMatch(/@anthropic-ai\/sdk/);
    expect(src).not.toMatch(/\bai\.(complete|chat|generate|run|invoke)\b/);
  });
});
