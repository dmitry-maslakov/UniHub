import type { CommandBus } from '@nestjs/cqrs';
import {
  FindCourseQuery,
  UnknownCourseError,
} from '../../catalog/contracts.js';
import {
  GrantCourseAccessCommand,
  RevokeCourseAccessCommand,
} from '../../identity/contracts.js';
import { FakeQueries } from './access.fakes.js';
import { CourseGrants } from './course-grants.js';

// catalog has one course, os-id
function grants() {
  const queries = new FakeQueries([
    [
      FindCourseQuery,
      ({ by }: FindCourseQuery) =>
        'id' in by && by.id === 'os-id' ? { id: 'os-id' } : null,
    ],
  ]);
  const sent: object[] = [];
  const commands = {
    execute: async (command: object) => void sent.push(command),
  } as unknown as CommandBus;
  return { sent, grants: new CourseGrants(queries.bus, commands) };
}

describe('CourseGrants', () => {
  it('hands identity a grant or a revoke of a course catalog has', async () => {
    const { grants: g, sent } = grants();
    await g.grant('ana', 'os-id');
    await g.revoke('ana', 'os-id');
    expect(sent).toEqual([
      new GrantCourseAccessCommand('ana', 'os-id'),
      new RevokeCourseAccessCommand('ana', 'os-id'),
    ]);
  });

  it('refuses a grant of a course no one made, and sends nothing', async () => {
    const { grants: g, sent } = grants();
    await expect(g.grant('ana', 'nope')).rejects.toBeInstanceOf(
      UnknownCourseError,
    );
    expect(sent).toEqual([]);
  });

  it("takes back a grant of a course catalog doesn't have", async () => {
    const { grants: g, sent } = grants();
    await g.revoke('ana', 'nope');
    expect(sent).toEqual([new RevokeCourseAccessCommand('ana', 'nope')]);
  });
});
