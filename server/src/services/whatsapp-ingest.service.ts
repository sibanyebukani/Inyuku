/**
 * WhatsApp inbound-event drainer logic.
 *
 * Claims verified events from the durable outbox (`WhatsAppInboundEvent`) and
 * resolves tenant/server-side routing before persisting `Conversation` /
 * `Message` rows. This is the async half of the fast-ack pipeline.
 */

import { prisma } from '../db.js';
import { auditLog } from '../utils/audit-logger.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { maskPhone } from '../utils/pii-mask.js';

export const INGEST_PER_TENANT_LIMIT = 300;
export const INGEST_WINDOW_MS = 60 * 1000;
export const MAX_RETRY_ATTEMPTS = 5;
export const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export type InboundStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed';

type InboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string };
  location?: unknown;
  contacts?: unknown;
  interactive?: unknown;
};

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: InboundMessage[];
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          conversation?: { id?: string };
          errors?: Array<{ code?: number; title?: string }>;
        }>;
      };
    }>;
  }>;
};

export interface ProcessResult {
  status: 'PROCESSED' | 'UNROUTED' | 'FAILED';
  businessId?: string | null;
  error?: string;
}

/**
 * Process a single `WhatsAppInboundEvent` outbox row.
 *
 * Steps (contract §3.1):
 *   7. Resolve tenant via phoneNumberId → WhatsAppChannel.businessId.
 *   8. Per-tenant Redis rate-limit.
 *   9. Upsert Conversation, set lastInboundAt.
 *  10. Insert Message(s) (provider-id idempotency); audit RECEIVE.
 *  11. Apply status callbacks.
 *  12. Mark event PROCESSED.
 */
export async function processInboundEvent(
  eventId: string,
  payload: unknown,
  phoneNumberId: string | null,
  opts?: { now?: Date },
): Promise<ProcessResult> {
  const now = opts?.now ?? new Date();
  const webhook = payload as WebhookPayload;

  // 7. Server-side tenant routing (never from payload).
  if (!phoneNumberId) {
    await prisma.whatsAppInboundEvent.update({
      where: { id: eventId },
      data: { status: 'UNROUTED', processedAt: now },
    });
    await auditLog({
      entity: 'whatsapp_webhook',
      action: 'UNROUTED',
      businessId: null,
      changes: { reason: { old: null, new: 'missing phone_number_id' } },
    });
    return { status: 'UNROUTED' };
  }

  const channel = await prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId },
  });
  if (!channel) {
    await prisma.whatsAppInboundEvent.update({
      where: { id: eventId },
      data: { status: 'UNROUTED', processedAt: now },
    });
    await auditLog({
      entity: 'whatsapp_webhook',
      action: 'UNROUTED',
      businessId: null,
      changes: { phoneNumberId: { old: null, new: phoneNumberId } },
    });
    return { status: 'UNROUTED' };
  }

  const businessId = channel.businessId;

  // 8. Per-tenant Redis rate-limit.
  const rate = await checkRateLimit(
    `business:${businessId}:whatsapp:ingest`,
    INGEST_PER_TENANT_LIMIT,
    INGEST_WINDOW_MS,
  );
  if (!rate.allowed) {
    throw new Error('Per-tenant ingest rate limit exceeded');
  }

  // Update event with resolved tenant.
  await prisma.whatsAppInboundEvent.update({
    where: { id: eventId },
    data: { businessId },
  });

  const value = webhook.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages ?? [];
  const statuses = value?.statuses ?? [];

  // 9 + 10. Upsert conversations and persist inbound messages.
  for (const msg of messages) {
    const waContactId = msg.from ?? value?.contacts?.[0]?.wa_id;
    if (!waContactId) continue;

    const occurredAt = parseTimestamp(msg.timestamp, now);
    if (!isWithinReplayWindow(occurredAt, now)) {
      // Advisory ±5-min replay window: drop stale/future message.
      continue;
    }

    const conversation = await upsertConversation(
      businessId,
      channel.id,
      waContactId,
      occurredAt,
    );

    const { type, body, mediaKey, mediaMimeType } = mapInboundMessage(msg);

    await prisma.message.createMany({
      data: [
        {
          businessId,
          conversationId: conversation.id,
          providerMessageId: msg.id ?? null,
          direction: 'INBOUND',
          type,
          body,
          mediaKey,
          mediaMimeType,
          status: 'RECEIVED',
          occurredAt,
        },
      ],
      skipDuplicates: true,
    });

    if (msg.id) {
      await auditLog({
        entity: 'whatsapp_message',
        action: 'RECEIVE',
        businessId,
        entityId: msg.id,
        changes: {
          direction: { old: null, new: 'INBOUND' },
          type: { old: null, new: type },
          waContactId: { old: null, new: maskPhone(waContactId) },
        },
      });
    }
  }

  // 11. Status callbacks.
  for (const status of statuses) {
    if (!status.id || !status.status) continue;
    const mappedStatus = mapStatus(status.status);
    if (!mappedStatus) continue;
    await prisma.message.updateMany({
      where: { businessId, providerMessageId: status.id },
      data: { status: mappedStatus },
    });
  }

  await prisma.whatsAppInboundEvent.update({
    where: { id: eventId },
    data: { status: 'PROCESSED', processedAt: now },
  });

  return { status: 'PROCESSED', businessId };
}

async function upsertConversation(
  businessId: string,
  channelId: string,
  waContactId: string,
  occurredAt: Date,
): Promise<{ id: string; lastInboundAt: Date | null }> {
  const existing = await prisma.conversation.findUnique({
    where: { businessId_channelId_waContactId: { businessId, channelId, waContactId } },
  });

  if (existing) {
    const lastInboundAt =
      existing.lastInboundAt && existing.lastInboundAt > occurredAt
        ? existing.lastInboundAt
        : occurredAt;
    return prisma.conversation.update({
      where: { id: existing.id },
      data: { lastInboundAt, status: 'OPEN' },
    });
  }

  return prisma.conversation.create({
    data: {
      businessId,
      channelId,
      waContactId,
      lastInboundAt: occurredAt,
      status: 'OPEN',
    },
  });
}

function parseTimestamp(timestamp: string | undefined, fallback: Date): Date {
  if (!timestamp) return fallback;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return new Date(seconds * 1000);
}

function isWithinReplayWindow(occurredAt: Date, now: Date): boolean {
  const delta = occurredAt.getTime() - now.getTime();
  return Math.abs(delta) <= REPLAY_WINDOW_MS;
}

function mapInboundMessage(msg: InboundMessage): {
  type: import('@prisma/client').MessageType;
  body: string | null;
  mediaKey: string | null;
  mediaMimeType: string | null;
} {
  const rawType = msg.type ?? 'unsupported';
  const type = toMessageType(rawType);

  switch (type) {
    case 'TEXT':
      return { type, body: msg.text?.body ?? null, mediaKey: null, mediaMimeType: null };
    case 'IMAGE':
      return {
        type,
        body: null,
        mediaKey: msg.image?.id ?? null,
        mediaMimeType: msg.image?.mime_type ?? null,
      };
    case 'DOCUMENT':
      return {
        type,
        body: null,
        mediaKey: msg.document?.id ?? null,
        mediaMimeType: msg.document?.mime_type ?? null,
      };
    case 'AUDIO':
      return {
        type,
        body: null,
        mediaKey: msg.audio?.id ?? null,
        mediaMimeType: msg.audio?.mime_type ?? null,
      };
    case 'VIDEO':
      return {
        type,
        body: null,
        mediaKey: msg.video?.id ?? null,
        mediaMimeType: msg.video?.mime_type ?? null,
      };
    case 'LOCATION':
      return { type, body: JSON.stringify(msg.location ?? null), mediaKey: null, mediaMimeType: null };
    case 'CONTACTS':
      return { type, body: JSON.stringify(msg.contacts ?? null), mediaKey: null, mediaMimeType: null };
    case 'INTERACTIVE':
      return {
        type,
        body: JSON.stringify(msg.interactive ?? null),
        mediaKey: null,
        mediaMimeType: null,
      };
    default:
      return { type: 'UNSUPPORTED', body: null, mediaKey: null, mediaMimeType: null };
  }
}

function toMessageType(raw: string): import('@prisma/client').MessageType {
  const map: Record<string, import('@prisma/client').MessageType> = {
    text: 'TEXT',
    image: 'IMAGE',
    document: 'DOCUMENT',
    audio: 'AUDIO',
    video: 'VIDEO',
    location: 'LOCATION',
    contacts: 'CONTACTS',
    interactive: 'INTERACTIVE',
    template: 'TEMPLATE',
  };
  return map[raw.toLowerCase()] ?? 'UNSUPPORTED';
}

function mapStatus(raw: string): import('@prisma/client').MessageStatus | null {
  const map: Record<string, import('@prisma/client').MessageStatus> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  };
  return map[raw.toLowerCase()] ?? null;
}

/**
 * Record a processing failure on the outbox row with bounded retry.
 * If attempts have been exhausted the row is marked FAILED.
 */
export async function markInboundEventFailed(
  eventId: string,
  attempts: number,
  error: string,
  _now = new Date(),
): Promise<void> {
  const status = attempts >= MAX_RETRY_ATTEMPTS ? 'FAILED' : 'PENDING';
  await prisma.whatsAppInboundEvent.update({
    where: { id: eventId },
    data: { status, lastError: error, attempts: { increment: 1 } },
  });
}
