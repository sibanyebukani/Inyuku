import { prisma } from '../db.js';
import type { Customer } from '@prisma/client';

export interface CreateCustomerInput {
  businessId: string;
  clientId: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  consentId?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** Idempotent create via clientId. */
export async function createCustomer(input: CreateCustomerInput): Promise<{ customer: Customer; duplicate: boolean }> {
  const existing = await prisma.customer.findUnique({
    where: { businessId_clientId: { businessId: input.businessId, clientId: input.clientId } },
  });
  if (existing) return { customer: existing, duplicate: true };

  const customer = await prisma.customer.create({
    data: {
      businessId: input.businessId,
      clientId: input.clientId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      consentId: input.consentId ?? null,
    },
  });

  return { customer, duplicate: false };
}

export async function listCustomers(businessId: string): Promise<Customer[]> {
  return prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCustomer(businessId: string, id: string): Promise<(Customer & { orders: unknown[] }) | null> {
  return prisma.customer.findFirst({
    where: { id, businessId },
    include: { orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
  }) as Promise<(Customer & { orders: unknown[] }) | null>;
}

export async function updateCustomer(
  businessId: string,
  id: string,
  input: UpdateCustomerInput,
  incomingOccurredAt?: Date,
): Promise<{ customer: Customer; conflict: boolean }> {
  const existing = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!existing) throw new Error('Customer not found');

  // LWW: if incomingOccurredAt is older than the existing updatedAt, it's a conflict
  if (incomingOccurredAt && incomingOccurredAt < existing.updatedAt) {
    return { customer: existing, conflict: true };
  }

  const data: Partial<UpdateCustomerInput> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.notes !== undefined) data.notes = input.notes;

  const customer = await prisma.customer.update({ where: { id }, data });
  return { customer, conflict: false };
}
