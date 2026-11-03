-- CreateTable
CREATE TABLE "CourseLink" (
    "portalCourseId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "year" INTEGER,

    CONSTRAINT "CourseLink_pkey" PRIMARY KEY ("portalCourseId")
);

-- CreateIndex
CREATE INDEX "CourseLink_courseId_idx" ON "CourseLink"("courseId");

-- AddForeignKey
ALTER TABLE "CourseLink" ADD CONSTRAINT "CourseLink_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLink" ADD CONSTRAINT "CourseLink_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
