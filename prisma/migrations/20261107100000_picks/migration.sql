-- users' picks of public portals' courses, and the courses their
-- connectors are asked to sync: picked, or in their grace since the last
-- pick went. No foreign keys: the users are identity's, the portal courses
-- catalog's (accounts.prisma)
-- CreateTable
CREATE TABLE "Pick" (
    "userId" TEXT NOT NULL,
    "portalCourseId" TEXT NOT NULL,
    "into" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pick_pkey" PRIMARY KEY ("userId","portalCourseId")
);

-- CreateTable
CREATE TABLE "WantedCourse" (
    "portalCourseId" TEXT NOT NULL,
    "until" TIMESTAMP(3),

    CONSTRAINT "WantedCourse_pkey" PRIMARY KEY ("portalCourseId")
);

-- CreateIndex
CREATE INDEX "Pick_portalCourseId_idx" ON "Pick"("portalCourseId");
