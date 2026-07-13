ALTER TABLE "JobSearchResult"
ADD COLUMN "applicationFlow" TEXT NOT NULL DEFAULT 'Not recorded',
ADD COLUMN "keyLegitimacySignals" TEXT NOT NULL DEFAULT 'Not recorded';

ALTER TABLE "JobSearchResult"
ALTER COLUMN "applicationFlow" DROP DEFAULT,
ALTER COLUMN "keyLegitimacySignals" DROP DEFAULT;
