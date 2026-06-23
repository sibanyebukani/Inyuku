/**
 * WhatsApp inbound outbox drainer.
 *
 * A lightweight interval sweeper that claims PENDING `WhatsAppInboundEvent`
 * rows with `FOR UPDATE SKIP LOCKED`, hands them to the ingest service, and
 * marks them PROCESSED / UNROUTED / FAILED. This is the durable Postgres
 * outbox drain (ADR-INY-017) — not a BullMQ queue.
 */

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { processInboundEvent, markInboundEventFailed, MAX_RETRY_ATTEMPTS } from './whatsapp-ingest.service.js';

export const DEFAULT_DRAIN_INTERVAL_MS = 1000;
export const DEFAULT_BATCH_SIZE = 10;

let drainInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function getDrainIntervalMs(): number {
  const env = process.env.WHATSAPP_INBOUND_DRAIN_INTERVAL_MS;
  if (!env) return DEFAULT_DRAIN_INTERVAL_MS;
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DRAIN_INTERVAL_MS;
}

export function getBatchSize(): number {
  const env = process.env.WHATSAPP_INBOUND_DRAIN_BATCH_SIZE;
  if (!env) return DEFAULT_BATCH_SIZE;
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_SIZE;
}

export function startWhatsAppDrainer(app: FastifyInstance): void {
  if (drainInterval) return;

  const intervalMs = getDrainIntervalMs();
  app.log.info({ event: 'whatsapp_drainer_start', intervalMs }, 'WhatsApp drainer started');

  drainInterval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await drainBatch(app);
    } catch (err) {
      app.log.error(
        { event: 'whatsapp_drainer_error', error: err instanceof Error ? err.message : String(err) },
        'WhatsApp drainer batch failed',
      );
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  // Ensure the interval does not keep the process alive on its own.
  if (drainInterval.unref) drainInterval.unref();
}

export function stopWhatsAppDrainer(app?: FastifyInstance): void {
  if (drainInterval) {
    clearInterval(drainInterval);
    drainInterval = null;
    app?.log.info({ event: 'whatsapp_drainer_stop' }, 'WhatsApp drainer stopped');
  }
}

export function isDrainerRunning(): boolean {
  return drainInterval !== null;
}

export async function claimPendingRows(batchSize: number): Promise<
  Array<{
    id: string;
    rawPayload: unknown;
    phoneNumberId: string | null;
    providerEventId: string;
    attempts: number;
  }>
> {
  return prisma.$queryRaw<
    Array<{
      id: string;
      rawPayload: unknown;
      phoneNumberId: string | null;
      providerEventId: string;
      attempts: number;
    }>
  >(
    Prisma.sql`
      SELECT
        id,
        raw_payload AS "rawPayload",
        phone_number_id AS "phoneNumberId",
        provider_event_id AS "providerEventId",
        attempts
      FROM whatsapp_inbound_events
      WHERE status = 'PENDING'
      ORDER BY received_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `,
  );
}

async function drainBatch(app: FastifyInstance): Promise<void> {
  const batchSize = getBatchSize();

  const rows = await claimPendingRows(batchSize);
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    try {
      await prisma.whatsAppInboundEvent.update({
        where: { id: row.id },
        data: { status: 'PROCESSING' },
      });

      const payload =
        typeof row.rawPayload === 'string' ? JSON.parse(row.rawPayload) : row.rawPayload;

      await processInboundEvent(row.id, payload as Record<string, unknown>, row.phoneNumberId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn(
        { event: 'whatsapp_drainer_row_failed', providerEventId: row.providerEventId, error: message },
        'WhatsApp drainer row failed',
      );
      const nextAttempts = row.attempts + 1;
      await markInboundEventFailed(row.id, nextAttempts, message);
      if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
        app.log.error(
          { event: 'whatsapp_drainer_row_failed_permanently', providerEventId: row.providerEventId },
          'WhatsApp drainer row permanently failed',
        );
      }
    }
  }
}
