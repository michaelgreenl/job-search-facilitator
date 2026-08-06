CREATE TYPE "ApplicationArtifactKind" AS ENUM (
    'resume',
    'cover-letter',
    'application-page'
);

CREATE TABLE "ApplicationArtifact" (
    "jobPostId" UUID NOT NULL,
    "kind" "ApplicationArtifactKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationArtifact_pkey" PRIMARY KEY ("jobPostId", "kind"),
    CONSTRAINT "ApplicationArtifact_fileName_check" CHECK (LENGTH(BTRIM("fileName")) > 0),
    CONSTRAINT "ApplicationArtifact_mediaType_check" CHECK (LENGTH(BTRIM("mediaType")) > 0),
    CONSTRAINT "ApplicationArtifact_sizeBytes_check" CHECK ("sizeBytes" > 0)
);

ALTER TABLE "ApplicationArtifact"
ADD CONSTRAINT "ApplicationArtifact_jobPostId_fkey"
FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
