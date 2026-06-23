/**
 * Approved-template registry for WhatsApp outbound sends.
 *
 * Only templates with `status = APPROVED` may be sent. The send path calls
 * `assertSendableTemplate` to validate the template exists, is approved, and
 * the bound parameters satisfy the stored `paramSchema`.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError, ConflictError, NotFoundError } from '../utils/errors.js';

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
export type TemplateStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
export type SendClass = 'TRANSACTIONAL' | 'MARKETING';

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  bodyText: string;
  paramSchema: ParamSpec[];
  providerTemplateId?: string | null;
}

export type ParamSpec = {
  name?: string;
  type: 'string' | 'number' | 'boolean';
};

export function defaultSendClassForCategory(category: TemplateCategory): SendClass {
  return category === 'MARKETING' ? 'MARKETING' : 'TRANSACTIONAL';
}

export async function listTemplates(businessId: string) {
  return prisma.whatsAppTemplate.findMany({
    where: { businessId },
    orderBy: [{ name: 'asc' }, { language: 'asc' }],
  });
}

export async function getTemplate(businessId: string, id: string) {
  const template = await prisma.whatsAppTemplate.findUnique({ where: { id } });
  if (!template || template.businessId !== businessId) throw new NotFoundError('Template not found');
  return template;
}

export async function createTemplate(businessId: string, input: TemplateInput) {
  const existing = await prisma.whatsAppTemplate.findUnique({
    where: { businessId_name_language: { businessId, name: input.name, language: input.language } },
  });
  if (existing) {
    throw new ConflictError('Template already exists for this name and language');
  }

  return prisma.whatsAppTemplate.create({
    data: {
      businessId,
      name: input.name,
      language: input.language,
      category: input.category,
      status: input.status,
      bodyText: input.bodyText,
      paramSchema: input.paramSchema as unknown as Prisma.InputJsonValue,
      providerTemplateId: input.providerTemplateId ?? null,
    },
  });
}

export async function updateTemplate(
  businessId: string,
  id: string,
  input: Partial<Omit<TemplateInput, 'name' | 'language'>>,
) {
  const existing = await getTemplate(businessId, id);
  const data: Prisma.WhatsAppTemplateUpdateInput = {};
  if (input.category !== undefined) data.category = input.category;
  if (input.status !== undefined) data.status = input.status;
  if (input.bodyText !== undefined) data.bodyText = input.bodyText;
  if (input.paramSchema !== undefined) {
    data.paramSchema = input.paramSchema as unknown as Prisma.InputJsonValue;
  }
  if (input.providerTemplateId !== undefined) data.providerTemplateId = input.providerTemplateId;

  try {
    return await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Template already exists for this name and language');
    }
    throw err;
  }
}

export async function deleteTemplate(businessId: string, id: string) {
  const existing = await getTemplate(businessId, id);
  await prisma.whatsAppTemplate.delete({ where: { id: existing.id } });
  return existing;
}

export interface SendableTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  defaultSendClass: SendClass;
  paramSchema: ParamSpec[];
  bodyText: string;
}

/**
 * Resolve an APPROVED template and validate bound parameters.
 * Throws `whatsapp_template_invalid` (422) on any mismatch.
 */
export async function assertSendableTemplate(
  businessId: string,
  name: string,
  language: string,
  params: Record<string, unknown> | null | undefined,
): Promise<SendableTemplate> {
  const template = await prisma.whatsAppTemplate.findUnique({
    where: { businessId_name_language: { businessId, name, language } },
  });

  if (!template) {
    throw new AppError('whatsapp_template_invalid', 'Template not registered', 422);
  }
  if (template.status !== 'APPROVED') {
    throw new AppError('whatsapp_template_invalid', 'Template is not approved', 422);
  }

  const paramSchema = (template.paramSchema ?? []) as ParamSpec[];
  validateTemplateParams(paramSchema, params ?? {});

  return {
    id: template.id,
    name: template.name,
    language: template.language,
    category: template.category as TemplateCategory,
    defaultSendClass: defaultSendClassForCategory(template.category as TemplateCategory),
    paramSchema,
    bodyText: template.bodyText,
  };
}

function validateTemplateParams(
  schema: ParamSpec[],
  params: Record<string, unknown>,
): void {
  const keys = Object.keys(params);
  if (keys.length !== schema.length) {
    throw new AppError(
      'whatsapp_template_invalid',
      `Template expects ${schema.length} parameters, received ${keys.length}`,
      422,
    );
  }

  for (let i = 0; i < schema.length; i += 1) {
    const spec = schema[i];
    const key = spec.name ?? String(i);
    if (!(key in params)) {
      throw new AppError('whatsapp_template_invalid', `Missing template parameter: ${key}`, 422);
    }
    const value = params[key];
    if (!isParamType(value, spec.type)) {
      throw new AppError(
        'whatsapp_template_invalid',
        `Template parameter ${key} must be ${spec.type}`,
        422,
      );
    }
  }
}

function isParamType(value: unknown, type: ParamSpec['type']): boolean {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}
