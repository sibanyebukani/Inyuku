/**
 * WhatsApp channel provisioning and configuration.
 *
 * Channels are the server-side tenant routing map. Provisioning is admin-only
 * (`whatsapp:manage_channel`); webhooks never auto-provision.
 */

import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export type ChannelMode = 'SANDBOX' | 'LIVE';

export interface CreateChannelInput {
  phoneNumberId: string;
  displayPhoneNumber: string;
  mode: ChannelMode;
  enabled?: boolean;
  wabaId?: string | null;
}

export interface UpdateChannelInput {
  displayPhoneNumber?: string;
  mode?: ChannelMode;
  enabled?: boolean;
  wabaId?: string | null;
}

export async function listChannels(businessId: string) {
  return prisma.whatsAppChannel.findMany({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getChannel(businessId: string, id: string) {
  const channel = await prisma.whatsAppChannel.findUnique({ where: { id } });
  if (!channel || channel.businessId !== businessId) throw new NotFoundError('Channel not found');
  return channel;
}

export async function createChannel(businessId: string, input: CreateChannelInput) {
  const existing = await prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
  });
  if (existing) {
    throw new ConflictError('phoneNumberId is already registered to another business');
  }

  return prisma.whatsAppChannel.create({
    data: {
      businessId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      mode: input.mode,
      enabled: input.enabled ?? false,
      wabaId: input.wabaId ?? null,
    },
  });
}

export async function updateChannel(
  businessId: string,
  id: string,
  input: UpdateChannelInput,
) {
  const existing = await getChannel(businessId, id);
  return prisma.whatsAppChannel.update({
    where: { id: existing.id },
    data: {
      ...(input.displayPhoneNumber !== undefined && { displayPhoneNumber: input.displayPhoneNumber }),
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.wabaId !== undefined && { wabaId: input.wabaId }),
    },
  });
}
