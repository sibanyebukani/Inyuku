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

  function inbound(body: string, type: 'TEXT' | 'INTERACTIVE' = 'TEXT', direction: 'INBOUND' | 'OUTBOUND' = 'INBOUND') {
    return { id: 'm', businessId: biz.id, conversationId: conv.id, direction, type, body, occurredAt: new Date() } as any;
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
});
