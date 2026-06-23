import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../db.js';
import { setSetting } from '../settings.service.js';
import { sendMessage } from '../whatsapp-bsp.client.js';

const channel = {
  id: 'channel-id',
  businessId: 'biz-id',
  phoneNumberId: 'phone-id',
  displayPhoneNumber: '+27821234567',
  mode: 'SANDBOX' as const,
  enabled: false,
  wabaId: null,
  lastInboundAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('whatsapp-bsp.client', () => {
  beforeAll(async () => {
    await setSetting('dialog360.apiKey', 'test-api-key', { isSecret: true });
    process.env.WHATSAPP_BSP_BASE_URL = 'https://test.360dialog.example';
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: 'dialog360.apiKey', businessId: 'platform' } });
    delete process.env.WHATSAPP_BSP_BASE_URL;
    vi.restoreAllMocks();
  });

  it('returns providerMessageId on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.bsp.123' }] }),
      text: async () => '',
    } as Response);

    const result = await sendMessage(channel, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '27821234567',
      type: 'text',
      text: { body: 'Hello' },
    });

    expect(result.providerMessageId).toBe('wamid.bsp.123');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.360dialog.example/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'D360-API-KEY': 'test-api-key' }),
      }),
    );
  });

  it('throws whatsapp_bsp_error on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad request' }),
      text: async () => 'bad request',
    } as Response);

    await expect(
      sendMessage(channel, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '27821234567',
        type: 'text',
        text: { body: 'Hello' },
      }),
    ).rejects.toMatchObject({ code: 'whatsapp_bsp_error', statusCode: 502 });
  });

});
