import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db.js';
import {
  getSetting,
  getSecretSetting,
  setSetting,
  WHATSAPP_WEBHOOK_APP_SECRET_KEY,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY,
  WHATSAPP_MESSAGE_RETENTION_DAYS_KEY,
} from '../settings.service.js';

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

  it('M3-A whatsapp.webhook.appSecret is encrypted and never returned in plaintext', async () => {
    await setSetting(WHATSAPP_WEBHOOK_APP_SECRET_KEY, 'top-secret-app-secret', {
      isSecret: true,
      businessId,
    });
    const masked = await getSetting(WHATSAPP_WEBHOOK_APP_SECRET_KEY, businessId);
    expect(masked).not.toContain('top-secret-app-secret');
    expect(masked).toBe('••••••••');
    const plain = await getSecretSetting(WHATSAPP_WEBHOOK_APP_SECRET_KEY, businessId);
    expect(plain).toBe('top-secret-app-secret');
  });

  it('M3-A whatsapp.webhook.verifyToken is encrypted and never returned in plaintext', async () => {
    await setSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, 'hub-verify-token', {
      isSecret: true,
      businessId,
    });
    expect(await getSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, businessId)).toBe('••••••••');
    expect(await getSecretSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, businessId)).toBe(
      'hub-verify-token',
    );
  });

  it('M3-A whatsapp.message.retentionDays is stored and returned in plaintext', async () => {
    await setSetting(WHATSAPP_MESSAGE_RETENTION_DAYS_KEY, '90', { isSecret: false, businessId });
    expect(await getSetting(WHATSAPP_MESSAGE_RETENTION_DAYS_KEY, businessId)).toBe('90');
  });
});
