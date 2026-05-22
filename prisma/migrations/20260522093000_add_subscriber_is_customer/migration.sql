-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN "isCustomer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Subscriber_isCustomer_idx" ON "Subscriber"("isCustomer");
