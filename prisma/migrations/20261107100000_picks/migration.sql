-- users' picks of public portals' courses, and the courses their
-- connectors are asked to sync: picked, or in their grace since the last
-- pick went
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

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedCourse" ADD CONSTRAINT "WantedCourse_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
