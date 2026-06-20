-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "phone_otps" ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "replaced_by_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

