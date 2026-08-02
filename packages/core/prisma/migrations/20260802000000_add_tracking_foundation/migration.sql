CREATE TYPE "TrackingActivitySource" AS ENUM ('manual', 'gmail', 'linkedin', 'system');

CREATE TYPE "TrackingActivityType" AS ENUM (
    'application-submitted',
    'application-acknowledged',
    'application-status-changed',
    'interview-requested',
    'interview-scheduled',
    'rejection-received',
    'offer-received',
    'outreach-sent',
    'outreach-response-received',
    'action-requested'
);

CREATE TABLE "JobPostSnapshot" (
    "jobPostId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPostSnapshot_pkey" PRIMARY KEY ("jobPostId"),
    CONSTRAINT "JobPostSnapshot_description_check" CHECK (LENGTH(BTRIM("description")) > 0)
);

CREATE TABLE "ApplicationArtifact" (
    "id" UUID NOT NULL,
    "jobPostId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "label" TEXT,
    "position" INTEGER NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationArtifact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApplicationArtifact_position_check" CHECK ("position" >= 0),
    CONSTRAINT "ApplicationArtifact_mediaType_check"
        CHECK ("mediaType" = 'application/pdf' OR "mediaType" ~ '^image/[A-Za-z0-9.+-]+$')
);

CREATE TABLE "TrackingActivity" (
    "id" UUID NOT NULL,
    "jobPostId" UUID NOT NULL,
    "outreachContactId" UUID,
    "type" "TrackingActivityType" NOT NULL,
    "applicationStatus" "ApplicationStatus",
    "source" "TrackingActivitySource" NOT NULL,
    "externalId" TEXT,
    "summary" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrackingActivity_automatedExternalId_check"
        CHECK ("source" NOT IN ('gmail', 'linkedin') OR "externalId" IS NOT NULL),
    CONSTRAINT "TrackingActivity_outreachContact_check"
        CHECK (
            "type" NOT IN ('outreach-sent', 'outreach-response-received')
            OR "outreachContactId" IS NOT NULL
        ),
    CONSTRAINT "TrackingActivity_applicationStatus_check"
        CHECK (
            "type" <> 'application-status-changed'
            OR "applicationStatus" IS NOT NULL
        )
);

CREATE TABLE "JobNextStep" (
    "jobPostId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "sourceActivityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobNextStep_pkey" PRIMARY KEY ("jobPostId"),
    CONSTRAINT "JobNextStep_title_check" CHECK (LENGTH(BTRIM("title")) > 0)
);

CREATE UNIQUE INDEX "ApplicationArtifact_storageKey_key"
ON "ApplicationArtifact"("storageKey");

CREATE UNIQUE INDEX "ApplicationArtifact_jobPostId_position_key"
ON "ApplicationArtifact"("jobPostId", "position");

CREATE UNIQUE INDEX "TrackingActivity_source_externalId_type_key"
ON "TrackingActivity"("source", "externalId", "type");

CREATE INDEX "TrackingActivity_jobPostId_occurredAt_idx"
ON "TrackingActivity"("jobPostId", "occurredAt");

CREATE INDEX "TrackingActivity_outreachContactId_occurredAt_idx"
ON "TrackingActivity"("outreachContactId", "occurredAt");

CREATE INDEX "JobNextStep_dueAt_idx"
ON "JobNextStep"("dueAt");

CREATE INDEX "JobNextStep_sourceActivityId_idx"
ON "JobNextStep"("sourceActivityId");

ALTER TABLE "JobPostSnapshot"
ADD CONSTRAINT "JobPostSnapshot_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationArtifact"
ADD CONSTRAINT "ApplicationArtifact_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackingActivity"
ADD CONSTRAINT "TrackingActivity_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrackingActivity"
ADD CONSTRAINT "TrackingActivity_outreachContactId_fkey"
FOREIGN KEY ("outreachContactId") REFERENCES "OutreachContact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobNextStep"
ADD CONSTRAINT "JobNextStep_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobNextStep"
ADD CONSTRAINT "JobNextStep_sourceActivityId_fkey"
FOREIGN KEY ("sourceActivityId") REFERENCES "TrackingActivity"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
