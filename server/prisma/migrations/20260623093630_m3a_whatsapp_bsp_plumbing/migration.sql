-- CreateEnum
CREATE TYPE "whatsapp_channel_mode" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('OPEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACTS', 'TEMPLATE', 'INTERACTIVE', 'STATUS', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "send_class" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "inbound_event_status" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'UNROUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "template_category" AS ENUM ('UTILITY', 'MARKETING', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');

-- CreateTable
CREATE TABLE "whatsapp_channels" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT NOT NULL,
    "mode" "whatsapp_channel_mode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "waba_id" TEXT,
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "wa_contact_id" TEXT NOT NULL,
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "status" "conversation_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "direction" "message_direction" NOT NULL,
    "type" "message_type" NOT NULL,
    "body" TEXT,
    "media_key" TEXT,
    "media_mime_type" TEXT,
    "send_class" "send_class",
    "template_name" TEXT,
    "template_params" JSONB,
    "status" "message_status" NOT NULL,
    "failure_reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_inbound_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "phone_number_id" TEXT,
    "provider_event_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "signature_verified" BOOLEAN NOT NULL,
    "status" "inbound_event_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "template_category" NOT NULL,
    "status" "template_status" NOT NULL,
    "body_text" TEXT NOT NULL,
    "param_schema" JSONB NOT NULL,
    "provider_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "whatsAppChannelId" TEXT,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_phone_number_id_key" ON "whatsapp_channels"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_channels_business_id_idx" ON "whatsapp_channels"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_channels_business_id_phone_number_id_key" ON "whatsapp_channels"("business_id", "phone_number_id");

-- CreateIndex
CREATE INDEX "conversations_business_id_idx" ON "conversations"("business_id");

-- CreateIndex
CREATE INDEX "conversations_customer_id_idx" ON "conversations"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_business_id_channel_id_wa_contact_id_key" ON "conversations"("business_id", "channel_id", "wa_contact_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_business_id_idx" ON "messages"("business_id");

-- CreateIndex
CREATE INDEX "messages_business_id_occurred_at_idx" ON "messages"("business_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_business_id_provider_message_id_key" ON "messages"("business_id", "provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_inbound_events_provider_event_id_key" ON "whatsapp_inbound_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_events_status_received_at_idx" ON "whatsapp_inbound_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "whatsapp_inbound_events_business_id_idx" ON "whatsapp_inbound_events"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_templates_business_id_idx" ON "whatsapp_templates"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_business_id_name_language_key" ON "whatsapp_templates"("business_id", "name", "language");

-- AddForeignKey
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "whatsapp_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_inbound_events" ADD CONSTRAINT "whatsapp_inbound_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_whatsAppChannelId_fkey" FOREIGN KEY ("whatsAppChannelId") REFERENCES "whatsapp_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
