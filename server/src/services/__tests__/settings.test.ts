import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db.js';
import { getSetting, getSecretSetting, setSetting } from '../settings.service.js';

describe('settings service', () => {
  let businessId: string;

  beforeAll(async () => {
    const business = await prisma.business.create({ data: { name: 'Test Co' } });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it('stores secret values encrypted and masks them by default', async () => {
    await setSetting('email.resend.apiKey', 'secret-key', { isSecret: true, businessId });

    const masked = await getSetting('email.resend.apiKey', businessId);
    expect(masked).not.toContain('secret-key');
    expect(masked).toBe('••••••••');

    const plain = await getSecretSetting('email.resend.apiKey', businessId);
    expect(plain).toBe('secret-key');

    const row = await prisma.setting.findUnique({
      where: { key_businessId: { key: 'email.resend.apiKey', businessId } },
    });
    expect(row?.value.startsWith('enc:v1:')).toBe(true);
  });

  it('stores plain values as plaintext', async () => {
    await setSetting('ai.enabled', 'true', { isSecret: false, businessId });

    const value = await getSetting('ai.enabled', businessId);
    expect(value).toBe('true');

    const row = await prisma.setting.findUnique({
      where: { key_businessId: { key: 'ai.enabled', businessId } },
    });
    expect(row?.value).toBe('true');
  });
});
