import { describe, it, expect, beforeAll, vi } from 'vitest';
import { prisma } from '../../db.js';
import { createTestBusiness } from '../../test-helpers.js';
import { evaluateAutoReplies } from '../whatsapp-autoreply.service.js';
import * as sendSvc from '../whatsapp-send.service.js';

describe('evaluateAutoReplies', () => {
  let biz: { id: string };
  let channel: { id: string };
  let conv: any;

  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'AutoReply Biz' });
    channel = await prisma.whatsAppChannel.create({ data: { businessId: biz.id, phoneNumberId: `pn-ar-${Date.now()}`, displayPhoneNumber: '+27827770000', mode: 'SANDBOX', enabled: false } });
    conv = await prisma.conversation.create({ data: { businessId: biz.id, channelId: channel.id, waContactId: '27827770000' } });
    await prisma.whatsAppAutoReplyRule.create({
      data: { businessId: biz.id, trigger: 'KEYWORD', keyword: 'price', action: 'SEND_TEXT', replyText: 'Prices on request', enabled: true, cooldownMinutes: 60 },
    });
  });

  function inbound(body: string, type: 'TEXT' | 'INTERACTIVE' = 'TEXT', direction: 'INBOUND' | 'OUTBOUND' = 'INBOUND', occurredAt?: Date) {
    return { id: 'm', businessId: biz.id, conversationId: conv.id, direction, type, body, occurredAt: occurredAt ?? new Date() } as any;
  }

  it('ignores OUTBOUND messages (Condition 7)', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('price', 'TEXT', 'OUTBOUND'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ignores non-TEXT/INTERACTIVE types (Condition 7)', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, { ...inbound('x'), type: 'IMAGE' } as any);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fires on an exact keyword match and emits a FIRE audit', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('PRICE'));
    expect(spy).toHaveBeenCalledTimes(1);
    const fire = await prisma.auditLog.findFirst({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conv.id } });
    expect(fire).toBeTruthy();
    spy.mockRestore();
  });

  it('suppresses a re-fire inside the cooldown window', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('price')); // FIRE already present from prior test
    expect(spy).not.toHaveBeenCalled();
    const supp = await prisma.auditLog.findFirst({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conv.id } });
    expect(supp).toBeTruthy();
    spy.mockRestore();
  });

  it('cooldown is per-rule, not per-trigger', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);

    const ruleA = await prisma.whatsAppAutoReplyRule.create({
      data: { businessId: biz.id, trigger: 'KEYWORD', keyword: 'deal', action: 'SEND_TEXT', replyText: 'A', enabled: true, cooldownMinutes: 60 },
    });
    const ruleB = await prisma.whatsAppAutoReplyRule.create({
      data: { businessId: biz.id, trigger: 'KEYWORD', keyword: 'offer', action: 'SEND_TEXT', replyText: 'B', enabled: true, cooldownMinutes: 60 },
    });

    await evaluateAutoReplies(biz.id, conv, inbound('deal'));
    expect(spy).toHaveBeenCalledTimes(1);

    // rule B must still fire even though a rule A FIRE exists for the same trigger type
    await evaluateAutoReplies(biz.id, conv, inbound('offer'));
    expect(spy).toHaveBeenCalledTimes(2);

    await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: { in: [ruleA.id, ruleB.id] } } });
    spy.mockRestore();
  });

  it('suppresses on send error, emits no FIRE, and does not start cooldown', async () => {
    const rule = await prisma.whatsAppAutoReplyRule.create({
      data: { businessId: biz.id, trigger: 'KEYWORD', keyword: 'sendfail', action: 'SEND_TEXT', replyText: 'x', enabled: true, cooldownMinutes: 60 },
    });
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ error: 'send_failed' } as any);

    await evaluateAutoReplies(biz.id, conv, inbound('sendfail'));
    expect(spy).toHaveBeenCalledTimes(1);

    const supp = await prisma.auditLog.findFirst({
      where: {
        businessId: biz.id, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conv.id,
        changes: { path: ['reason', 'new'], equals: 'send_error' },
      },
    });
    expect(supp).toBeTruthy();

    const fire = await prisma.auditLog.findFirst({
      where: {
        businessId: biz.id, entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conv.id,
        changes: { path: ['ruleId', 'new'], equals: rule.id },
      },
    });
    expect(fire).toBeFalsy();

    // a second inbound must retry because no cooldown was started
    await evaluateAutoReplies(biz.id, conv, inbound('sendfail'));
    expect(spy).toHaveBeenCalledTimes(2);

    await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: rule.id } });
    spy.mockRestore();
  });

  describe('OUT_OF_HOURS / SAST boundary coverage', () => {
    async function makeOohRule(overrides: Partial<{ hoursStart: string; hoursEnd: string; daysActive: number[] }> = {}) {
      return prisma.whatsAppAutoReplyRule.create({
        data: {
          businessId: biz.id,
          trigger: 'OUT_OF_HOURS',
          action: 'SEND_TEXT',
          replyText: 'We are closed',
          enabled: true,
          cooldownMinutes: 0,
          hoursStart: '09:00',
          hoursEnd: '17:00',
          daysActive: [],
          ...overrides,
        },
      });
    }

    it('does not fire when message is inside the open window', async () => {
      const rule = await makeOohRule();
      const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
      // SAST Tue 18 Jun 2024 12:00 == UTC 10:00
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-18T10:00:00.000Z')));
      expect(spy).not.toHaveBeenCalled();
      await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: rule.id } });
      spy.mockRestore();
    });

    it('fires when message is outside the open window', async () => {
      const rule = await makeOohRule();
      const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
      // SAST Tue 18 Jun 2024 20:00 == UTC 18:00
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-18T18:00:00.000Z')));
      expect(spy).toHaveBeenCalledTimes(1);
      await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: rule.id } });
      spy.mockRestore();
    });

    it('handles a midnight-wrap window correctly', async () => {
      const rule = await makeOohRule({ hoursStart: '22:00', hoursEnd: '06:00' });
      const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
      // SAST Tue 02:00 is inside the 22:00-06:00 open window -> no fire
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-18T00:00:00.000Z')));
      expect(spy).not.toHaveBeenCalled();
      // SAST Tue 12:00 is outside the open window -> fire
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-18T10:00:00.000Z')));
      expect(spy).toHaveBeenCalledTimes(1);
      await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: rule.id } });
      spy.mockRestore();
    });

    it('respects daysActive', async () => {
      const rule = await makeOohRule({ daysActive: [6, 7] });
      const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
      // SAST Sat 22 Jun 2024 20:00 is outside window and a weekend -> fire
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-22T18:00:00.000Z')));
      expect(spy).toHaveBeenCalledTimes(1);
      // SAST Mon 24 Jun 2024 20:00 is outside window but not Sat/Sun -> no fire
      await evaluateAutoReplies(biz.id, conv, inbound('hi', 'TEXT', 'INBOUND', new Date('2024-06-24T18:00:00.000Z')));
      expect(spy).toHaveBeenCalledTimes(1);
      await prisma.whatsAppAutoReplyRule.deleteMany({ where: { id: rule.id } });
      spy.mockRestore();
    });
  });
});
