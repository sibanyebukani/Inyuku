import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { prisma } from '../../db.js';
import { assertConsentGranted } from '../whatsapp-send.service.js';
import { createTestBusiness } from '../../test-helpers.js';

describe('assertConsentGranted with customer context (Conditions 4/5, R1 seam)', () => {
  let bizA: { id: string };

  beforeAll(async () => {
    bizA = await createTestBusiness({ name: 'Consent Biz A' });
  });

  afterEach(async () => {
    await prisma.consentRevocation.deleteMany({ where: { consent: { businessId: bizA.id } } });
    await prisma.consent.deleteMany({ where: { businessId: bizA.id } });
    await prisma.customer.deleteMany({ where: { businessId: bizA.id } });
  });

  it('still allows transactional free-form regardless of ctx', async () => {
    await expect(assertConsentGranted(bizA.id, 'TRANSACTIONAL', false, { customerId: null })).resolves.toBeUndefined();
  });

  it('default-denies marketing with no grant', async () => {
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it('honours a per-customer GRANTED consent for marketing', async () => {
    const consent = await prisma.consent.create({ data: { businessId: bizA.id, purpose: 'whatsapp:marketing', status: 'GRANTED' } });
    const cust = await prisma.customer.create({ data: { businessId: bizA.id, clientId: `cc-${Date.now()}`, name: 'C', consentId: consent.id } });
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, { customerId: cust.id })).resolves.toBeUndefined();
  });

  it('denies when the per-customer consent is revoked', async () => {
    const consent = await prisma.consent.create({ data: { businessId: bizA.id, purpose: 'whatsapp:marketing', status: 'GRANTED' } });
    await prisma.consentRevocation.create({ data: { consentId: consent.id, reason: 'opt-out' } });
    const cust = await prisma.customer.create({ data: { businessId: bizA.id, clientId: `cc2-${Date.now()}`, name: 'C', consentId: consent.id } });
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, { customerId: cust.id })).rejects.toMatchObject({ statusCode: 403 });
  });
});
