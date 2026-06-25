/**
 * Thin 360dialog BSP outbound client.
 *
 * - `sendMessage` posts to `WHATSAPP_BSP_BASE_URL/v1/messages`.
 * - Reads the API key from the encrypted Setting `dialog360.apiKey`.
 * - The BSP key never leaves the server and is never logged.
 * - Sandbox-aware: calls are identical in SANDBOX/LIVE; the routing map
 *   (`WhatsAppChannel`) is the cut-over seam.
 */

import type { WhatsAppChannel } from '@prisma/client';
import { getSecretSetting } from './settings.service.js';
import { AppError } from '../utils/errors.js';

export interface BspSendPayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'template';
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string; policy?: string };
    components?: Array<{
      type: 'body' | 'header';
      parameters: Array<{ type: 'text'; text: string }>;
    }>;
  };
}

export interface BspSendResult {
  providerMessageId: string;
}

export function getBspBaseUrl(): string {
  return (process.env.WHATSAPP_BSP_BASE_URL ?? 'https://waba.360dialog.io').replace(/\/$/, '');
}

export async function sendMessage(
  channel: WhatsAppChannel,
  payload: BspSendPayload,
): Promise<BspSendResult> {
  const apiKey = await getSecretSetting('dialog360.apiKey');
  if (!apiKey) {
    throw new AppError('whatsapp_bsp_misconfigured', '360dialog API key not configured', 422);
  }

  const baseUrl = getBspBaseUrl();
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => 'unknown');
    throw new AppError(
      'whatsapp_bsp_error',
      `360dialog returned ${res.status}: ${bodyText}`,
      502,
      { status: res.status },
    );
  }

  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  const providerMessageId = data.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new AppError('whatsapp_bsp_error', '360dialog response missing message id', 502);
  }

  return { providerMessageId };
}
