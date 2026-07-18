CREATE TYPE "OutreachRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE "OutreachRun" (
    "id" UUID NOT NULL,
    "jobPostId" UUID NOT NULL,
    "requestedContactCount" INTEGER NOT NULL,
    "status" "OutreachRunStatus" NOT NULL DEFAULT 'pending',
    "workTaskId" UUID,
    "workThreadId" TEXT,
    "workTurnId" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutreachRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutreachRun_requestedContactCount_check"
        CHECK ("requestedContactCount" IN (2, 3))
);

CREATE INDEX "OutreachRun_jobPostId_idx" ON "OutreachRun"("jobPostId");

ALTER TABLE "OutreachRun"
ADD CONSTRAINT "OutreachRun_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
