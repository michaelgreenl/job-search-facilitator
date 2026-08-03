ALTER TABLE "JobPost"
ADD COLUMN "appliedAt" TIMESTAMPTZ(3),
ADD COLUMN "applicationStatusUpdatedAt" TIMESTAMPTZ(3);

UPDATE "JobPost"
SET
    "appliedAt" = "createdAt",
    "applicationStatusUpdatedAt" = "updatedAt"
WHERE "applicationStatus" <> 'not-applied';

ALTER TABLE "OutreachContact"
ADD COLUMN "messagedAt" TIMESTAMPTZ(3),
ADD COLUMN "respondedAt" TIMESTAMPTZ(3),
ADD COLUMN "responseStatusUpdatedAt" TIMESTAMPTZ(3);

UPDATE "OutreachContact"
SET
    "messagedAt" = "createdAt",
    "responseStatusUpdatedAt" = "updatedAt"
WHERE "messaged" = TRUE;

CREATE TYPE "JobPostActivitySource" AS ENUM ('manual', 'gmail', 'linkedin');

CREATE TYPE "JobPostActivityType" AS ENUM (
    'application-submitted',
    'application-status-changed',
    'application-acknowledged',
    'interview-requested',
    'rejection-received',
    'hiring-confirmed',
    'outreach-sent',
    'outreach-response-received',
    'review-needed'
);

CREATE TYPE "JobPostNextStepSource" AS ENUM ('manual', 'automation');

ALTER TABLE "JobPost"
ADD COLUMN "nextStepTitle" TEXT,
ADD COLUMN "nextStepDueAt" TIMESTAMPTZ(3),
ADD COLUMN "nextStepCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN "nextStepSource" "JobPostNextStepSource";

CREATE TABLE "JobPostSnapshot" (
    "jobPostId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobPostSnapshot_pkey" PRIMARY KEY ("jobPostId"),
    CONSTRAINT "JobPostSnapshot_description_check" CHECK (LENGTH(BTRIM("description")) > 0)
);

CREATE TABLE "ApplicationSnapshot" (
    "jobPostId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ApplicationSnapshot_pkey" PRIMARY KEY ("jobPostId"),
    CONSTRAINT "ApplicationSnapshot_content_check" CHECK (LENGTH(BTRIM("content")) > 0)
);

CREATE TABLE "JobPostActivity" (
    "id" UUID NOT NULL,
    "jobPostId" UUID NOT NULL,
    "outreachContactId" UUID,
    "type" "JobPostActivityType" NOT NULL,
    "source" "JobPostActivitySource" NOT NULL,
    "externalId" TEXT,
    "summary" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobPostActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobPostActivity_externalId_check"
        CHECK ("source" = 'manual' OR "externalId" IS NOT NULL),
    CONSTRAINT "JobPostActivity_summary_check" CHECK (LENGTH(BTRIM("summary")) > 0)
);

CREATE UNIQUE INDEX "JobPostActivity_source_externalId_key"
ON "JobPostActivity"("source", "externalId");

CREATE INDEX "JobPostActivity_jobPostId_occurredAt_idx"
ON "JobPostActivity"("jobPostId", "occurredAt");

CREATE INDEX "JobPostActivity_outreachContactId_occurredAt_idx"
ON "JobPostActivity"("outreachContactId", "occurredAt");

ALTER TABLE "JobPostSnapshot"
ADD CONSTRAINT "JobPostSnapshot_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationSnapshot"
ADD CONSTRAINT "ApplicationSnapshot_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPostActivity"
ADD CONSTRAINT "JobPostActivity_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobPostActivity"
ADD CONSTRAINT "JobPostActivity_outreachContactId_fkey"
FOREIGN KEY ("outreachContactId") REFERENCES "OutreachContact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
