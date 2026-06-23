/**
 * WhatsApp outbound send service.
 *
 * Server-enforced window selection, consent + enable-flag gates, and BSP hand-off.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { assertSendableTemplate } from './whatsapp-template.service.js';
import { sendMessage, type BspSendPayload } from './whatsapp-bsp.client.js';
import { windowState } from './whatsapp-window.js';
import { auditLog } from '../utils/audit-logger.js';
import { maskPhone } from '../utils/pii-mask.js';

export type SendClass = 'TRANSACTIONAL' | 'MARKETING';
export type OutboundType = 'TEXT' | 'TEMPLATE';

export interface SendMessageInput {
  type: OutboundType;
  sendClass: SendClass;
  body?: string | null;
  templateName?: string | null;
  templateParams?: Record<string, unknown> | null;
  language?: string | null;
}

export interface ConsentContext {
  conversationId?: string;
  customerId?: string | null;
  waContactId?: string;
}

/**
 * Default-deny consent enforcement point (POPIA §7b stub).
 *
 * - Transactional free-form sends inside an open window are allowed.
 * - Any template send requires a recorded grant.
 * - Marketing free-form requires a recorded grant.
 *
 * Wired to the M1 Consent/ConsentRevocation ledger; the ruling can replace
 * this function without touching the send path.
 */
export async function assertConsentGranted(
  businessId: string,
  sendClass: SendClass,
  isTemplate: boolean,
  ctx?: ConsentContext,
): Promise<void> {
  // Transactional free-form inside an open window is always allowed (M3-A behaviour preserved).
  if (sendClass === 'TRANSACTIONAL' && !isTemplate) return;

  // R1 seam: a per-customer consent, when present, governs. In M3-B Customer.consentId
  // stays nullable so this branch is inert by default (per-customer store deferred).
  if (ctx?.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
      include: { consent: { include: { revocations: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (customer?.consent) {
      const ok = customer.consent.status === 'GRANTED' && customer.consent.revocations.length === 0;
      if (!ok) throw new AppError('whatsapp_consent_denied', 'WhatsApp consent not granted', 403);
      return;
    }
    // no per-customer grant -> fall through to business-scoped default-deny
  }

  const purpose = isTemplate ? 'whatsapp:template' : 'whatsapp:marketing';
  const grant = await prisma.consent.findFirst({
    where: {
      businessId,
      purpose,
      status: 'GRANTED',
      revocations: { none: {} },
    },
    orderBy: { grantedAt: 'desc' },
  });

  if (!grant) {
    // Contract §9.2: emit the machine-readable code `whatsapp_consent_denied`
    // (parallel to the window/disabled gates), not the generic FORBIDDEN code.
    throw new AppError('whatsapp_consent_denied', 'WhatsApp consent not granted', 403);
  }
}

export async function sendWhatsAppMessage(
  businessId: string,
  conversationId: string,
  input: SendMessageInput,
  opts?: { now?: Date },
) {
  const now = opts?.now ?? new Date();

  // 1. sendClass is required (enforced by schema/caller).
  if (!input.sendClass) {
    throw new AppError('VALIDATION_ERROR', 'sendClass is required', 400);
  }

  // Resolve conversation + channel (tenant-enforced).
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true },
  });
  if (!conversation || conversation.businessId !== businessId) {
    throw new NotFoundError('Conversation not found');
  }

  // 2. Enable-flag gate: LIVE + disabled is refused; sandbox always allowed.
  if (conversation.channel.mode === 'LIVE' && !conversation.channel.enabled) {
    throw new AppError('whatsapp_channel_disabled', 'WhatsApp channel is disabled', 422);
  }

  // 3. Consent enforcement point.
  await assertConsentGranted(businessId, input.sendClass, input.type === 'TEMPLATE', {
    conversationId: conversation.id,
    customerId: conversation.customerId,
    waContactId: conversation.waContactId,
  });

  // 4. Window selection.
  const { state: windowStateResult } = windowState(conversation.lastInboundAt, now);

  if (input.type === 'TEXT' && windowStateResult === 'CLOSED') {
    throw new AppError(
      'whatsapp_window_closed',
      'Session window is closed; use an approved template',
      409,
    );
  }

  let templateName: string | null = null;
  let templateLanguage: string | null = null;
  let templateParamSchema: import('./whatsapp-template.service.js').ParamSpec[] | null = null;

  if (input.type === 'TEMPLATE') {
    if (!input.templateName || !input.language) {
      throw new AppError('whatsapp_template_invalid', 'templateName and language are required', 422);
    }
    const template = await assertSendableTemplate(
      businessId,
      input.templateName,
      input.language,
      input.templateParams,
    );
    templateName = template.name;
    templateLanguage = template.language;
    templateParamSchema = template.paramSchema;
  }

  // 5. Create QUEUED message.
  const message = await prisma.message.create({
    data: {
      businessId,
      conversationId,
      direction: 'OUTBOUND',
      type: input.type,
      body: input.body ?? null,
      sendClass: input.sendClass,
      templateName,
      templateParams:
        (input.templateParams as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      status: 'QUEUED',
      occurredAt: now,
    },
  });

  // Build BSP payload.
  let bspPayload: BspSendPayload;
  if (input.type === 'TEXT') {
    bspPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.waContactId,
      type: 'text',
      text: { body: input.body ?? '' },
    };
  } else {
    const components = templateParamSchema?.length
      ? [
          {
            type: 'body' as const,
            parameters: templateParamSchema.map((spec, idx) => {
              const key = spec.name ?? String(idx);
              const value = input.templateParams?.[key];
              return { type: 'text' as const, text: String(value ?? '') };
            }),
          },
        ]
      : undefined;
    bspPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.waContactId,
      type: 'template',
      template: {
        name: templateName!,
        language: { code: templateLanguage!, policy: 'deterministic' },
        components,
      },
    };
  }

  try {
    const { providerMessageId } = await sendMessage(conversation.channel, bspPayload);

    const sent = await prisma.message.update({
      where: { id: message.id },
      data: { status: 'SENT', providerMessageId },
    });

    await auditLog({
      entity: 'whatsapp_message',
      action: 'SEND',
      businessId,
      entityId: message.id,
      changes: {
        direction: { old: null, new: 'OUTBOUND' },
        type: { old: null, new: input.type },
        waContactId: { old: null, new: maskPhone(conversation.waContactId) },
        sendClass: { old: null, new: input.sendClass },
      },
    });

    return { message: sent };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // The raw provider error may carry internal/PII detail — persist the full
    // text only to the server-side ErrorLog (correlated by messageId). The
    // Message row and the client-facing response carry a generic code only.
    const failed = await prisma.message.update({
      where: { id: message.id },
      data: { status: 'FAILED', failureReason: 'send_failed' },
    });

    await prisma.errorLog.create({
      data: {
        businessId,
        code: 'WHATSAPP_SEND_FAILED',
        message: reason,
        context: {
          messageId: message.id,
          conversationId,
          type: input.type,
          sendClass: input.sendClass,
        },
      },
    });

    return { message: failed, error: 'send_failed' };
  }
}
