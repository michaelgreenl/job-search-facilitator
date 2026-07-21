CREATE TABLE "OutreachContact" (
    "id" UUID NOT NULL,
    "jobPostId" UUID NOT NULL,
    "personName" TEXT NOT NULL,
    "personTitle" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "relevanceRationale" TEXT NOT NULL,
    "draftMessage" TEXT NOT NULL,
    "messaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutreachContact_jobPostId_idx" ON "OutreachContact"("jobPostId");

ALTER TABLE "OutreachContact"
ADD CONSTRAINT "OutreachContact_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
