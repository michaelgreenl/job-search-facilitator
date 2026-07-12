-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('not-applied', 'awaiting-response', 'interviewing', 'rejected', 'hired');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('unknown', 'active', 'closed');

-- CreateEnum
CREATE TYPE "UserLabel" AS ENUM ('P1', 'P2', 'quick-app');

-- CreateEnum
CREATE TYPE "AgentLabel" AS ENUM ('target', 'quick-app');

-- CreateEnum
CREATE TYPE "ResumeType" AS ENUM ('frontend', 'backend-full-stack', 'general');

-- CreateTable
CREATE TABLE "JobPost" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "compensation" TEXT,
    "postSource" TEXT NOT NULL,
    "applicationUrl" TEXT NOT NULL,
    "postStatus" "PostStatus" NOT NULL DEFAULT 'unknown',
    "applicationStatus" "ApplicationStatus" NOT NULL DEFAULT 'not-applied',
    "userRank" INTEGER,
    "userLabel" "UserLabel",
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchReport" (
    "id" UUID NOT NULL,
    "reportDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobSearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchResult" (
    "reportId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "agentRank" INTEGER NOT NULL,
    "agentLabel" "AgentLabel" NOT NULL,
    "fitRationale" TEXT NOT NULL,
    "recommendedResume" "ResumeType" NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "legitimacyNotes" TEXT,

    CONSTRAINT "JobSearchResult_pkey" PRIMARY KEY ("reportId","postId")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPost_sourceKey_key" ON "JobPost"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobSearchReport_reportDate_key" ON "JobSearchReport"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "JobSearchResult_reportId_agentRank_key" ON "JobSearchResult"("reportId", "agentRank");

-- AddForeignKey
ALTER TABLE "JobSearchResult" ADD CONSTRAINT "JobSearchResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "JobSearchReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSearchResult" ADD CONSTRAINT "JobSearchResult_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JobPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
