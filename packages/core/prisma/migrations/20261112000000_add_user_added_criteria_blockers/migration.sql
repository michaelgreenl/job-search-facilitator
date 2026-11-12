ALTER TABLE "UserAddedJobPost"
ADD COLUMN "criteriaBlockers" TEXT[] DEFAULT ARRAY[]::TEXT[];
