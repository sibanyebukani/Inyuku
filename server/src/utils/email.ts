/**
 * Email utility — Settings-first with env fallback (ADR-INY-011).
 *
 * Provider precedence:
 *   1. Setting `email.resend.apiKey` (isSecret) → Resend SDK
 *   2. env `RESEND_API_KEY` (bootstrap fallback) → Resend SDK
 *   3. nothing configured → PROVIDER_DISABLED
 *
 * Edge-UNSAFE (Node SDK) — never import into Edge code.
 */

import { Resend } from 'resend';
import { getSecretSetting } from '../services/settings.service.js';
import {
  verificationEmailHtml,
  passwordResetEmailHtml,
  welcomeEmailHtml,
} from './email-templates.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Inyuku';
const DEFAULT_FROM_ADDRESS = process.env.EMAIL_FROM ?? 'noreply@inyuku.co.za';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromAddress?: string;
}

export type EmailResult =
  | { sent: true; providerId: string; provider: 'resend' }
  | {
      sent: false;
      reason: 'PROVIDER_DISABLED' | 'SEND_FAILED';
      provider?: 'resend';
      error?: string;
    };

function formatFrom(name: string | undefined, address: string): string {
  if (name && name.trim().length > 0) {
    return `${name} <${address}>`;
  }
  return address;
}

async function resolveResendConfig(): Promise<{
  apiKey: string;
  fromName?: string;
  fromAddress: string;
} | null> {
  const apiKey = await getSecretSetting('email.resend.apiKey');
  if (apiKey) {
    const fromName = (await getSecretSetting('email.resend.fromName')) ?? undefined;
    const fromAddress = (await getSecretSetting('email.resend.fromAddress')) ?? DEFAULT_FROM_ADDRESS;
    return { apiKey, fromName, fromAddress };
  }

  const envKey = process.env.RESEND_API_KEY;
  if (envKey) {
    return { apiKey: envKey, fromName: APP_NAME, fromAddress: DEFAULT_FROM_ADDRESS };
  }

  return null;
}

async function sendViaResend(
  cfg: { apiKey: string; fromName?: string; fromAddress: string },
  params: SendEmailParams,
): Promise<EmailResult> {
  try {
    const client = new Resend(cfg.apiKey);
    const result = await client.emails.send({
      from: formatFrom(params.fromName ?? cfg.fromName, params.fromAddress ?? cfg.fromAddress),
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    });

    if (result.error) {
      return {
        sent: false,
        reason: 'SEND_FAILED',
        provider: 'resend',
        error:
          typeof result.error === 'object' && result.error && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : JSON.stringify(result.error),
      };
    }
    const id = result.data?.id;
    if (!id) {
      return {
        sent: false,
        reason: 'SEND_FAILED',
        provider: 'resend',
        error: 'RESEND_NO_ID',
      };
    }
    return { sent: true, provider: 'resend', providerId: id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: 'SEND_FAILED', provider: 'resend', error: msg };
  }
}

/**
 * Send an email using the configured Resend provider.
 * Never throws — returns an EmailResult.
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const cfg = await resolveResendConfig();
  if (!cfg) {
    return { sent: false, reason: 'PROVIDER_DISABLED' };
  }

  return sendViaResend(cfg, params);
}

// ---------------------------------------------------------------------------
// Auth template helpers
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  appName?: string,
): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const aName = appName ?? APP_NAME;
  await sendEmail({
    to,
    subject: `Verify your email — ${aName}`,
    html: verificationEmailHtml(name, link, aName),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  appName?: string,
): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const aName = appName ?? APP_NAME;
  await sendEmail({
    to,
    subject: `Reset your password — ${aName}`,
    html: passwordResetEmailHtml(name, link, aName),
  });
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  appName?: string,
): Promise<void> {
  const aName = appName ?? APP_NAME;
  await sendEmail({
    to,
    subject: `Welcome — ${aName}`,
    html: welcomeEmailHtml(name, aName),
  });
}
