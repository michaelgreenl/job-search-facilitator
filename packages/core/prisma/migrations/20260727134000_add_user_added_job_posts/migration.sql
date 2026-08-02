CREATE TABLE "UserAddedJobPost" (
    "postId" UUID NOT NULL,
    "agentLabel" "AgentLabel" NOT NULL,
    "fitRationale" TEXT NOT NULL,
    "applicationFlow" TEXT NOT NULL,
    "keyLegitimacySignals" TEXT NOT NULL,
    "recommendedResume" "ResumeType" NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "legitimacyNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserAddedJobPost_pkey" PRIMARY KEY ("postId")
);

ALTER TABLE "UserAddedJobPost"
ADD CONSTRAINT "UserAddedJobPost_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
