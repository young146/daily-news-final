-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general';

-- CreateIndex
CREATE INDEX "Subscriber_category_idx" ON "Subscriber"("category");
