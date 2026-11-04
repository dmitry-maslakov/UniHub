import { MediaType, PortalId } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { MisplacedFileError, UnknownReferenceError } from '../domain/errors.js';
import { FILE_CONTENT_CHANGED, FILE_REMOVED } from '../domain/events.js';
import {
  RemoveFileCommand,
  SetFileContentCommand,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  type FileInput,
} from './commands.js';
import { onFakes } from './handlers.fakes.js';

const portal = PortalId.parse('canvas');
const ref = (externalId: string) => ({ portal, externalId });
const hash = sha256('%PDF lecture 5');
const file = (fields: Partial<FileInput> = {}): FileInput => ({
  ...ref('f1'),
  course: null,
  item: null,
  name: 'lecture-5.pdf',
  path: '',
  url: null,
  size: 1000,
  mime: MediaType.parse('application/pdf'),
  sourceUpdatedAt: null,
  ...fields,
});

// two portal courses and a post in the first
async function catalog() {
  const fakes = await onFakes();
  const { commands } = fakes;
  const course = (externalId: string) =>
    commands.execute(
      new UpsertPortalCourseCommand({
        ...ref(externalId),
        name: externalId,
        url: null,
        meta: null,
      }),
    );
  const a = await course('c-a');
  await course('c-b');
  const post = await commands.execute(
    new UpsertItemCommand({
      ...ref('post'),
      course: 'c-a',
      kind: 'post',
      title: null,
      url: null,
      publishedAt: null,
      raw: {},
    }),
  );
  return { ...fakes, a, post };
}

describe('file commands', () => {
  it("place a new file in its post's course and ask for its content", async () => {
    const { commands, files, a, post } = await catalog();

    const result = await commands.execute(
      new UpsertFileCommand(file({ course: 'c-a', item: 'post' })),
    );

    expect(result).toMatchObject({ changed: true, needsContent: true });
    expect(files.records.get('canvas:f1')).toMatchObject({
      id: result.id,
      placement: { portalCourseId: a.id, itemId: post.id },
    });
  });

  it('write nothing when the portal sends a file again', async () => {
    const { commands, files } = await catalog();
    await commands.execute(new UpsertFileCommand(file()));

    expect(await commands.execute(new UpsertFileCommand(file()))).toMatchObject(
      { changed: false, needsContent: true },
    );
    expect(files.writes).toBe(1);
  });

  it('refuse a name never sent, or a post of another course', async () => {
    const { commands, files } = await catalog();

    await expect(
      commands.execute(new UpsertFileCommand(file({ item: 'nope' }))),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
    await expect(
      commands.execute(
        new UpsertFileCommand(file({ course: 'c-b', item: 'post' })),
      ),
    ).rejects.toBeInstanceOf(MisplacedFileError);
    expect(files.records.size).toBe(0);
  });

  it('store content and announce it once', async () => {
    const { commands, files } = await catalog();
    const { id } = await commands.execute(new UpsertFileCommand(file()));

    const store = new SetFileContentCommand(ref('f1'), hash);
    expect(await commands.execute(store)).toEqual({ changed: true });
    expect(await commands.execute(store)).toEqual({ changed: false });
    expect(await commands.execute(new UpsertFileCommand(file()))).toMatchObject(
      { needsContent: false },
    );
    expect(files.events).toEqual([
      { topic: FILE_CONTENT_CHANGED, payload: { portal, fileId: id, hash } },
    ]);
  });

  it("refuse content of a file they don't know", async () => {
    const { commands } = await catalog();

    await expect(
      commands.execute(new SetFileContentCommand(ref('nope'), hash)),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
  });

  it('remove a file once, and an unknown one not at all', async () => {
    const { commands, files } = await catalog();
    const { id } = await commands.execute(new UpsertFileCommand(file()));

    const remove = (externalId: string) =>
      commands.execute(new RemoveFileCommand(ref(externalId)));
    expect(await remove('nope')).toEqual({ changed: false });
    expect(await remove('f1')).toEqual({ changed: true });
    expect(await remove('f1')).toEqual({ changed: false });
    expect(files.events).toEqual([
      { topic: FILE_REMOVED, payload: { portal, fileId: id } },
    ]);
  });

  it('bring a removed file back when it is sent again, its content announced anew', async () => {
    const { commands, files } = await catalog();
    const { id } = await commands.execute(new UpsertFileCommand(file()));
    await commands.execute(new SetFileContentCommand(ref('f1'), hash));
    await commands.execute(new RemoveFileCommand(ref('f1')));
    files.events.length = 0;

    expect(await commands.execute(new UpsertFileCommand(file()))).toEqual({
      id,
      changed: true,
      needsContent: false,
    });
    expect(files.records.get('canvas:f1')?.removedAt).toBeNull();
    expect(files.events).toEqual([
      { topic: FILE_CONTENT_CHANGED, payload: { portal, fileId: id, hash } },
    ]);
  });
});
