-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "input_tokens" INTEGER,
ADD COLUMN     "output_tokens" INTEGER,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

