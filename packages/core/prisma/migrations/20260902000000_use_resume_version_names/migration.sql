ALTER TABLE "JobSearchResult"
ALTER COLUMN "recommendedResume" TYPE TEXT USING "recommendedResume"::TEXT;

ALTER TABLE "UserAddedJobPost"
ALTER COLUMN "recommendedResume" TYPE TEXT USING "recommendedResume"::TEXT;

DROP TYPE "ResumeType";
