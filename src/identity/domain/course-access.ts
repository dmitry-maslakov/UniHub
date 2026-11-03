// which courses a user may read, by catalog course id
export abstract class CourseAccessRepository {
  // false if the user already had it
  abstract grant(userId: string, courseId: string): Promise<boolean>;
  // false if the user didn't have it
  abstract revoke(userId: string, courseId: string): Promise<boolean>;
  abstract courseIds(userId: string): Promise<string[]>;
}
