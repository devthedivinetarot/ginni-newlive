-- Newsletter automation (card-of-the-day emails, Mon/Wed/Fri). Run once in
-- Supabase's SQL Editor, same as the other migrations.

-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "lastEmailAt" TIMESTAMP(3);
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "lastWhatsappAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "card" TEXT NOT NULL,
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "whatsappSent" INTEGER NOT NULL DEFAULT 0,
    "whatsappFailed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_issueKey_key" ON "NewsletterIssue"("issueKey");
