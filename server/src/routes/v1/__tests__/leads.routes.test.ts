import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import { redis } from '../../../redis.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await prisma.lead.deleteMany({
    where: { email: { in: ['leads-test@inyuku.test', 'impact-test@inyuku.test', 'story-test@inyuku.test'] } },
  });
});

describe('leads routes', () => {
  it('creates a contact lead and returns NEW', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        source: 'contact',
        name: 'Sibanye Test',
        email: 'leads-test@inyuku.test',
        message: 'I want to learn more.',
        consentGiven: true,
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('NEW');
    expect(body.data.id).toBeTruthy();

    const lead = await prisma.lead.findUnique({ where: { id: body.data.id } });
    expect(lead).toBeDefined();
    expect(lead?.source).toBe('CONTACT');
    expect(lead?.email).toBe('leads-test@inyuku.test');
    expect(lead?.consent).toBe(true);
  });

  it('validates impact_report email', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: { source: 'impact_report', email: 'not-an-email' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('stores share_story extras in payload', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        source: 'share_story',
        name: 'Storyteller',
        email: 'story-test@inyuku.test',
        businessName: 'Sizwe Spaza',
        businessType: 'spaza',
        story: 'Started with one crate.',
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    const lead = await prisma.lead.findUnique({ where: { id: body.data.id } });
    expect(lead?.source).toBe('SHARE_STORY');
    expect(lead?.payload).toMatchObject({
      businessName: 'Sizwe Spaza',
      businessType: 'spaza',
      story: 'Started with one crate.',
    });
  });

  it('rate-limits rapid submissions per IP', async () => {
    const prev = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = 'false';
    await redis.flushall();
    let blocked = false;
    try {
      for (let i = 0; i < 11; i++) {
        const r = await app.inject({
          method: 'POST',
          url: '/v1/leads',
          payload: {
            source: 'impact_report',
            email: `impact-test@inyuku.test`,
          },
        });
        if (r.statusCode === 429) {
          blocked = true;
          expect(r.json()).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
          break;
        }
      }
      expect(blocked).toBe(true);
    } finally {
      process.env.RATE_LIMIT_DISABLED = prev;
    }
  });
});
