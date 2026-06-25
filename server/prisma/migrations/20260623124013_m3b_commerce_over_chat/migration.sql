-- CreateEnum
CREATE TYPE "auto_reply_trigger" AS ENUM ('GREETING', 'KEYWORD', 'OUT_OF_HOURS');

-- CreateEnum
CREATE TYPE "auto_reply_action" AS ENUM ('SEND_TEXT', 'SHARE_CATALOG');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "conversation_id" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_auto_reply_rules" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "trigger" "auto_reply_trigger" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keyword" TEXT,
    "action" "auto_reply_action" NOT NULL,
    "reply_text" TEXT,
    "hours_start" TEXT,
    "hours_end" TEXT,
    "days_active" INTEGER[],
    "cooldown_minutes" INTEGER NOT NULL DEFAULT 720,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_auto_reply_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_auto_reply_rules_business_id_idx" ON "whatsapp_auto_reply_rules"("business_id");

-- CreateIndex
CREATE INDEX "whatsapp_auto_reply_rules_business_id_trigger_enabled_idx" ON "whatsapp_auto_reply_rules"("business_id", "trigger", "enabled");

-- CreateIndex
CREATE INDEX "orders_conversation_id_idx" ON "orders"("conversation_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_auto_reply_rules" ADD CONSTRAINT "whatsapp_auto_reply_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
