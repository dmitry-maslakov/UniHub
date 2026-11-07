import { NO_INSTANCE, PortalId } from '@app/kernel';
import { UnknownReferenceError } from '../domain/errors.js';
import { ITEM_CHANGED, ITEM_REMOVED } from '../domain/events.js';
import {
  RemoveItemCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  type ItemInput,
} from './commands.js';
import { key, onFakes } from './handlers.fakes.js';

const portal = PortalId.parse('canvas');
const ref = (externalId: string) => ({
  portal,
  instance: NO_INSTANCE,
  externalId,
});
const item = (fields: Partial<ItemInput> = {}): ItemInput => ({
  ...ref('post-1'),
  course: null,
  kind: 'post',
  title: 'Exam',
  url: null,
  publishedAt: null,
  raw: { guid: 'post-1' },
  ...fields,
});

describe('item commands', () => {
  it('put an item in its course and tell plugins of every real change', async () => {
    const { commands, items, portalCourses } = await onFakes();
    const course = await commands.execute(
      new UpsertPortalCourseCommand({
        ...ref('os'),
        name: 'OS',
        url: null,
        meta: null,
      }),
    );

    const first = await commands.execute(
      new UpsertItemCommand(item({ course: 'os' })),
    );
    const again = await commands.execute(
      new UpsertItemCommand(item({ course: 'os' })),
    );
    const edited = await commands.execute(
      new UpsertItemCommand(item({ course: 'os', title: 'Exam moved' })),
    );

    expect([first.changed, again.changed, edited.changed]).toEqual([
      true,
      false,
      true,
    ]);
    expect(items.records.get(key(ref('post-1')))?.portalCourseId).toBe(
      course.id,
    );
    const changed = {
      topic: ITEM_CHANGED,
      payload: { portal, itemId: first.id },
    };
    expect(items.events).toEqual([changed, changed]);
    expect(portalCourses.events).toEqual([]);
  });

  it('refuse an item of a course never sent', async () => {
    const { commands, items } = await onFakes();

    await expect(
      commands.execute(new UpsertItemCommand(item({ course: 'nope' }))),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
    expect(items.records.size).toBe(0);
  });

  it('remove an item once, and an unknown one not at all', async () => {
    const { commands, items } = await onFakes();
    const { id } = await commands.execute(new UpsertItemCommand(item()));
    items.events.length = 0;

    const remove = (externalId: string) =>
      commands.execute(new RemoveItemCommand(ref(externalId)));
    expect(await remove('nope')).toEqual({ changed: false });
    expect(await remove('post-1')).toEqual({ changed: true });
    expect(await remove('post-1')).toEqual({ changed: false });
    expect(items.events).toEqual([
      { topic: ITEM_REMOVED, payload: { portal, itemId: id } },
    ]);
  });
});
