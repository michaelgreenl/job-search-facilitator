ALTER TABLE "JobPostActivity"
ADD COLUMN "notificationReadAt" TIMESTAMPTZ(3),
ADD COLUMN "notificationClearedAt" TIMESTAMPTZ(3);

-- An update that was saved before this migration is not news.
UPDATE "JobPostActivity" SET "notificationReadAt" = CURRENT_TIMESTAMP;
