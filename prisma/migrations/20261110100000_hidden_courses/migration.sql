-- the courses a user hides, each by its portal course. No foreign keys:
-- the users are identity's, the portal courses catalog's (accounts.prisma)
-- CreateTable
CREATE TABLE "HiddenCourse" (
    "userId" TEXT NOT NULL,
    "portalCourseId" TEXT NOT NULL,

    CONSTRAINT "HiddenCourse_pkey" PRIMARY KEY ("userId","portalCourseId")
);

-- a public portal's catalog is synced whole: no course is wanted apart
-- DropTable
DROP TABLE "WantedCourse";

-- nothing asks who picks a course any longer
-- DropIndex
DROP INDEX "Pick_portalCourseId_idx";
