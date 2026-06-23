import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db.js';
import { createTestBusiness } from '../../test-helpers.js';
import {
  createTemplate,
  assertSendableTemplate,
  defaultSendClassForCategory,
} from '../whatsapp-template.service.js';
import { AppError } from '../../utils/errors.js';

describe('whatsapp-template.service', () => {
  let businessId: string;

  beforeAll(async () => {
    const business = await createTestBusiness({ name: 'Template Service Test' });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.whatsAppTemplate.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it('defaultSendClassForCategory maps UTILITY/AUTH → TRANSACTIONAL, MARKETING → MARKETING', () => {
    expect(defaultSendClassForCategory('UTILITY')).toBe('TRANSACTIONAL');
    expect(defaultSendClassForCategory('AUTHENTICATION')).toBe('TRANSACTIONAL');
    expect(defaultSendClassForCategory('MARKETING')).toBe('MARKETING');
  });

  it('assertSendableTemplate returns the approved template', async () => {
    await createTemplate(businessId, {
      name: 'approved-template',
      language: 'en',
      category: 'UTILITY',
      status: 'APPROVED',
      bodyText: 'Hello {{1}}',
      paramSchema: [{ name: '1', type: 'string' }],
    });

    const t = await assertSendableTemplate(businessId, 'approved-template', 'en', { '1': 'World' });
    expect(t.name).toBe('approved-template');
    expect(t.defaultSendClass).toBe('TRANSACTIONAL');
  });

  it('assertSendableTemplate throws whatsapp_template_invalid for non-approved template', async () => {
    await createTemplate(businessId, {
      name: 'draft-template',
      language: 'en',
      category: 'MARKETING',
      status: 'DRAFT',
      bodyText: 'Buy now',
      paramSchema: [],
    });

    await expect(assertSendableTemplate(businessId, 'draft-template', 'en', {})).rejects.toThrow(
      AppError,
    );
    await expect(assertSendableTemplate(businessId, 'draft-template', 'en', {})).rejects.toMatchObject(
      { code: 'whatsapp_template_invalid', statusCode: 422 },
    );
  });

  it('assertSendableTemplate throws whatsapp_template_invalid for param mismatch', async () => {
    await createTemplate(businessId, {
      name: 'param-template',
      language: 'en',
      category: 'UTILITY',
      status: 'APPROVED',
      bodyText: 'Hello {{1}}',
      paramSchema: [{ name: '1', type: 'string' }],
    });

    await expect(
      assertSendableTemplate(businessId, 'param-template', 'en', { '1': 123 }),
    ).rejects.toMatchObject({ code: 'whatsapp_template_invalid' });

    await expect(
      assertSendableTemplate(businessId, 'param-template', 'en', {}),
    ).rejects.toMatchObject({ code: 'whatsapp_template_invalid' });
  });
});
