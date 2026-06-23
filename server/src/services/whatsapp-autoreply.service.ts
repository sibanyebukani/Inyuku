import type { Conversation, Message, WhatsAppAutoReplyRule } from '@prisma/client';
import { prisma } from '../db.js';
import { auditLog } from '../utils/audit-logger.js';
import { sendWhatsAppMessage } from './whatsapp-send.service.js';
import { composeCatalogText } from './whatsapp-catalog-share.service.js';

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** SAST (UTC+2, no DST) calendar parts of an instant. */
function sastParts(d: Date): { minutes: number; isoWeekday: number } {
  const fmt = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const minute = Number(parts.find((p) => p.type === 'minute')!.value);
  const wdShort = parts.find((p) => p.type === 'weekday')!.value;
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { minutes: hour * 60 + minute, isoWeekday: map[wdShort] ?? 1 };
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function matchesTrigger(rule: WhatsAppAutoReplyRule, message: Message, now: Date): boolean {
  if (rule.trigger === 'GREETING') return true; // any inbound text; cooldown gates re-fire
  if (rule.trigger === 'KEYWORD') return !!rule.keyword && normalizeText(message.body) === normalizeText(rule.keyword);
  if (rule.trigger === 'OUT_OF_HOURS') {
    if (!rule.hoursStart || !rule.hoursEnd) return false;
    const { minutes, isoWeekday } = sastParts(now);
    const dayActive = rule.daysActive.length === 0 || rule.daysActive.includes(isoWeekday);
    if (!dayActive) return false;
    const start = hhmmToMinutes(rule.hoursStart);
    const end = hhmmToMinutes(rule.hoursEnd);
    const open = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    return !open; // out-of-hours = OUTSIDE the open window
  }
  return false;
}

async function inCooldown(conversationId: string, ruleId: string, cooldownMinutes: number, now: Date): Promise<boolean> {
  if (cooldownMinutes <= 0) return false;
  const since = new Date(now.getTime() - cooldownMinutes * 60_000);
  const prior = await prisma.auditLog.findFirst({
    where: {
      entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conversationId, createdAt: { gte: since },
      changes: { path: ['ruleId', 'new'], equals: ruleId },
    },
  });
  return !!prior;
}

export async function evaluateAutoReplies(businessId: string, conversation: Conversation, message: Message): Promise<void> {
  // Condition 7: only inbound TEXT/INTERACTIVE drives auto-replies.
  if (message.direction !== 'INBOUND') return;
  if (message.type !== 'TEXT' && message.type !== 'INTERACTIVE') return;

  const rules = await prisma.whatsAppAutoReplyRule.findMany({
    where: { businessId, enabled: true, OR: [{ channelId: null }, { channelId: conversation.channelId }] },
  });
  if (rules.length === 0) return;

  const now = message.occurredAt;
  for (const rule of rules) {
    if (!matchesTrigger(rule, message, now)) continue;

    if (await inCooldown(conversation.id, rule.id, rule.cooldownMinutes, now)) {
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conversation.id, changes: { ruleId: { old: null, new: rule.id }, trigger: { old: null, new: rule.trigger }, reason: { old: null, new: 'cooldown' } } });
      continue;
    }

    const text = rule.action === 'SHARE_CATALOG' ? await composeCatalogText(businessId) : (rule.replyText ?? '');
    try {
      await sendWhatsAppMessage(businessId, conversation.id, { type: 'TEXT', sendClass: 'TRANSACTIONAL', body: text });
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conversation.id, changes: { ruleId: { old: null, new: rule.id }, trigger: { old: null, new: rule.trigger }, action: { old: null, new: rule.action } } });
    } catch {
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conversation.id, changes: { ruleId: { old: null, new: rule.id }, trigger: { old: null, new: rule.trigger }, reason: { old: null, new: 'send_error' } } });
    }
  }
}
