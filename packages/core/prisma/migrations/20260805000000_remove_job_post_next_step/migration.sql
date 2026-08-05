ALTER TABLE "JobPost"
DROP COLUMN "nextStepTitle",
DROP COLUMN "nextStepDueAt",
DROP COLUMN "nextStepCompletedAt",
DROP COLUMN "nextStepSource";

DROP TYPE "JobPostNextStepSource";
