import { UnknownUserError } from '../domain/errors.js';
import { Reader } from '../domain/reader.js';
import {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
} from './commands.js';
import {
  GrantCourseAccessHandler,
  RevokeCourseAccessHandler,
} from './course-access.handlers.js';
import { InMemoryCourseAccess, InMemoryReaders } from './identity.fakes.js';

function identity() {
  const readers = new InMemoryReaders(new Map([['ana', new Reader([], null)]]));
  const access = new InMemoryCourseAccess();
  const grant = new GrantCourseAccessHandler(readers, access);
  const revoke = new RevokeCourseAccessHandler(readers, access);
  return {
    access,
    grant: (userId: string, courseId: string) =>
      grant.execute(new GrantCourseAccessCommand(userId, courseId)),
    revoke: (userId: string, courseId: string) =>
      revoke.execute(new RevokeCourseAccessCommand(userId, courseId)),
  };
}

describe('course access commands', () => {
  it('grant a course once, saying whether anything changed', async () => {
    const { access, grant } = identity();

    expect(await grant('ana', 'os')).toEqual({ changed: true });
    expect(await grant('ana', 'os')).toEqual({ changed: false });
    expect(await access.courseIds('ana')).toEqual(['os']);
  });

  it('revoke what was granted, and nothing else', async () => {
    const { access, grant, revoke } = identity();
    await grant('ana', 'os');

    expect(await revoke('ana', 'net')).toEqual({ changed: false });
    expect(await revoke('ana', 'os')).toEqual({ changed: true });
    expect(await access.courseIds('ana')).toEqual([]);
  });

  it('refuse a user who does not exist', async () => {
    const { access, grant, revoke } = identity();

    await expect(grant('nobody', 'os')).rejects.toBeInstanceOf(
      UnknownUserError,
    );
    await expect(revoke('nobody', 'os')).rejects.toBeInstanceOf(
      UnknownUserError,
    );
    expect(access.grants.size).toBe(0);
  });
});
