ALTER TABLE "JobPost" ADD COLUMN "postUrl" TEXT;

UPDATE "JobPost" SET "postUrl" = "applicationUrl";

ALTER TABLE "JobPost" ALTER COLUMN "postUrl" SET NOT NULL;
