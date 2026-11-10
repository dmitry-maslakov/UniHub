-- the courses a user hides or turns off, each by its portal course. No
-- foreign keys: the users are identity's, the portal courses catalog's
-- (accounts.prisma)
-- CreateTable
CREATE TABLE "CourseSwitch" (
    "userId" TEXT NOT NULL,
    "portalCourseId" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "CourseSwitch_pkey" PRIMARY KEY ("userId","portalCourseId")
);
