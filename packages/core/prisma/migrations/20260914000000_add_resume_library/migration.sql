ALTER TABLE "JobSearchResult" ALTER COLUMN "recommendedResume" TYPE TEXT USING "recommendedResume"::TEXT;
ALTER TABLE "UserAddedJobPost" ALTER COLUMN "recommendedResume" TYPE TEXT USING "recommendedResume"::TEXT;
DROP TYPE "ResumeType";

CREATE TABLE "Resume" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Resume_name_key" ON "Resume"("name");

CREATE TABLE "ResumeUpload" (
    "id" UUID NOT NULL,
    "sequence" SERIAL NOT NULL,
    "resumeId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeUpload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResumeUpload_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResumeUpload_sequence_key" ON "ResumeUpload"("sequence");
CREATE INDEX "ResumeUpload_resumeId_sequence_idx" ON "ResumeUpload"("resumeId", "sequence");
