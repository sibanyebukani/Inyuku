import { LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { auditLog } from '../utils/audit-logger.js';
import { sendEmail } from '../utils/email.js';
import type { AuditContext } from '../types/fastify.d.js';

export interface ContactLeadInput {
  source: 'contact';
  name: string;
  email: string;
  message: string;
  consentGiven?: boolean;
}

export interface ImpactReportLeadInput {
  source: 'impact_report';
  email: string;
  consentGiven?: boolean;
}

export interface ShareStoryLeadInput {
  source: 'share_story';
  name?: string;
  email?: string;
  consentGiven?: boolean;
  [key: string]: unknown;
}

export type LeadInput = ContactLeadInput | ImpactReportLeadInput | ShareStoryLeadInput;

interface CaptureContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function mapSource(source: LeadInput['source']): LeadSource {
  switch (source) {
    case 'contact':
      return LeadSource.CONTACT;
    case 'impact_report':
      return LeadSource.IMPACT_REPORT;
    case 'share_story':
      return LeadSource.SHARE_STORY;
    default:
      throw new Error(`Unknown lead source: ${source}`);
  }
}

function extractPayload(input: LeadInput): Record<string, unknown> | undefined {
  if (input.source !== 'share_story') return undefined;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'source' || key === 'name' || key === 'email' || key === 'consentGiven') continue;
    rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Persist a public lead capture. Best-effort email notification to the platform inbox;
 * failures are swallowed so the 201 response is never blocked.
 */
export async function createLead(
  input: LeadInput,
  ctx: CaptureContext,
  auditCtx: AuditContext,
) {
  const source = mapSource(input.source);
  const payload = extractPayload(input);

  const lead = await prisma.lead.create({
    data: {
      source,
      status: LeadStatus.NEW,
      name: input.source !== 'impact_report' ? (input.name ?? null) : null,
      email: input.email ?? null,
      message: input.source === 'contact' ? input.message : null,
      payload: payload ? (payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      ip: ctx.ipAddress ?? null,
      ua: ctx.userAgent ?? null,
      consent: input.consentGiven ?? null,
    },
  });

  await auditLog({
    userId: auditCtx.userId ?? null,
    businessId: null,
    entity: 'lead',
    action: 'CREATE',
    entityId: lead.id,
    changes: {
      source: { old: null, new: input.source },
      status: { old: null, new: LeadStatus.NEW },
    },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  const notificationEmail = process.env.LEAD_NOTIFICATION_EMAIL;
  if (notificationEmail) {
    try {
      await sendEmail({
        to: notificationEmail,
        subject: `New Inyuku lead — ${input.source}`,
        html: `<p>A new lead was captured from <strong>${input.source}</strong>.</p>
<p>Email: ${input.email ?? '—'}<br>Name: ${input.source !== 'impact_report' ? (input.name ?? '—') : '—'}</p>
<p>Status: NEW</p>`,
        text: `New lead: ${input.source}\nEmail: ${input.email ?? '—'}\nName: ${input.source !== 'impact_report' ? (input.name ?? '—') : '—'}`,
      });
    } catch {
      // Best-effort notification; never fail the request.
    }
  }

  return { id: lead.id, status: lead.status };
}
