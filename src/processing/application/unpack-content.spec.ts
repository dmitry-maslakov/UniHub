import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import type { Member, UnpacksContent } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import {
  catalogOf,
  processor,
  unpacker,
} from '../../../test/discovered-plugins.js';
import { FakeUnpacker } from '../../../test/fake-plugins.js';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import { sha256 } from '../../../test/sha256.js';
import { LIMITS, TreeBudget } from '../domain/tree-budget.js';
import { Dispatch } from './dispatch.js';
import type { UnpackJob } from './plugin-job.js';
import {
  FakeFiles,
  FakeQueue,
  InMemoryUnpackings,
} from './processing.fakes.js';
import { UnpackContent } from './unpack-content.js';

// a fake bundle: JSON of its members' paths and texts
const bundle = (members: Record<string, string>) => JSON.stringify(members);
const lab = bundle({ 'src/main.c': 'int main', 'README.md': '# lab' });

const text = (content: string) => Readable.from([Buffer.from(content)]);

// these members, whatever the container holds
const listing = (
  ...members: (Partial<Member> & { path: string })[]
): UnpacksContent => ({
  async *unpack() {
    for (const member of members) yield { content: text('text'), ...member };
  },
});

// a file lab.bundle holding the container, unpacked by `instance`
function run(
  container = lab,
  instance: UnpacksContent = new FakeUnpacker(),
  version = 1,
) {
  const hash = sha256(container);
  const plugins = catalogOf({
    unpackers: [unpacker('bundle', ['.bundle'], instance, version)],
    processors: [processor('text', ['.c', '.md'])],
  });
  const files = new FakeFiles(
    new Map([['f', { name: 'lab.bundle', mime: null, hash }]]),
  );
  const blobs = new InMemoryBlobs({ holding: [container] });
  const unpackings = new InMemoryUnpackings();
  const queue = new FakeQueue();
  const unpack = new UnpackContent(
    plugins,
    files,
    blobs,
    unpackings,
    new Dispatch(plugins, files),
    queue,
  );
  const job: UnpackJob = {
    kind: 'unpack',
    key: { hash, unpacker: PluginName.parse('bundle'), version },
    policy: LIMITS.policy,
  };
  const tree = () => unpackings.trees.get(hash);
  // the paths listed, with why each left out was
  const listed = () =>
    tree()?.members.map(({ path, leftOut }) =>
      leftOut ? `${path} ${leftOut}` : path,
    );
  return { unpack, job, files, blobs, unpackings, queue, tree, listed };
}

const processing = (content: string) => ({
  kind: 'process',
  key: { hash: sha256(content), processor: 'text', version: 1 },
});

describe('UnpackContent', () => {
  it('stores the members, saves the tree, then queues their processing', async () => {
    const { unpack, job, blobs, tree, queue } = run();

    await unpack.run(job);

    expect(tree()).toEqual({
      ...job.key,
      policy: LIMITS.policy,
      members: [
        {
          path: 'src/main.c',
          hash: sha256('int main'),
          size: 8,
          mime: null,
          leftOut: null,
        },
        {
          path: 'README.md',
          hash: sha256('# lab'),
          size: 5,
          mime: null,
          leftOut: null,
        },
      ],
      cutShort: null,
    });
    expect(blobs.stored.get(sha256('int main'))?.toString()).toBe('int main');
    expect(blobs.opened.every((stream) => stream.destroyed)).toBe(true);
    expect(queue.enqueued).toEqual([
      processing('int main'),
      processing('# lab'),
    ]);
  });

  it("makes paths safe, leaving out unlisted what can't be and noise", async () => {
    const { unpack, job, listed } = run(
      bundle({
        'src\\util.c': 'a',
        '../evil.c': 'b',
        '/etc/passwd': 'c',
        '.git/config': 'd',
        'node_modules/x/index.js': 'e',
      }),
    );

    await unpack.run(job);

    expect(listed()).toEqual(['src/util.c']);
  });

  it('lists a member past its limit unstored, by its size or by its bytes', async () => {
    const declared = text('big');
    const spent = vi.spyOn(TreeBudget.prototype, 'spent');
    const { unpack, job, tree, blobs } = run(
      lab,
      listing(
        { path: 'big.bin', size: 2000, content: declared },
        {
          path: 'liar.bin',
          size: 4,
          content: Readable.from([Buffer.alloc(2000)]),
        },
      ),
    );

    await unpack.run(job);

    expect(tree()?.members).toEqual([
      {
        path: 'big.bin',
        hash: null,
        size: 2000,
        mime: null,
        leftOut: 'TOO_LARGE',
      },
      {
        path: 'liar.bin',
        hash: null,
        size: 4,
        mime: null,
        leftOut: 'TOO_LARGE',
      },
    ]);
    expect(declared.destroyed).toBe(true);
    expect(blobs.stored.size).toBe(1);
    // what it read of the liar counts, though nothing's kept
    expect(spent.mock.calls).toEqual([[1024]]);
  });

  it('keeps of a size a container declares only a whole number of bytes', async () => {
    const { unpack, job, tree } = run(
      lab,
      listing(
        { path: 'video.mp4', size: 3e9 },
        { path: 'a.c', size: -1 },
        { path: 'b.c', size: 1.5 },
      ),
    );

    await unpack.run(job);

    expect(tree()?.members.map(({ size }) => size)).toEqual([3e9, 4, 4]);
  });

  it('lists a path the container has twice, the second unstored', async () => {
    const { unpack, job, listed } = run(
      lab,
      listing({ path: 'a.c' }, { path: './a.c' }),
    );

    await unpack.run(job);

    expect(listed()).toEqual(['a.c', 'a.c DUPLICATE_PATH']);
  });

  it('opens the containers in it, their members under their paths', async () => {
    const inner = bundle({ 'main.c': 'int main' });
    const { unpack, job, listed, queue } = run(
      bundle({ 'team1/lab.bundle': inner, 'notes.md': '# notes' }),
    );

    await unpack.run(job);

    expect(listed()).toEqual([
      'team1/lab.bundle',
      'notes.md',
      'team1/lab.bundle/main.c',
    ]);
    expect(queue.enqueued).toEqual([
      processing('# notes'),
      processing('int main'),
    ]);
  });

  it('opens containers no deeper than the limit', async () => {
    const deepest = bundle({ 'd.c': 'x' });
    const { unpack, job, listed } = run(
      bundle({
        'a.bundle': bundle({ 'b.bundle': bundle({ 'c.bundle': deepest }) }),
      }),
    );

    await unpack.run(job);

    expect(listed()).toEqual([
      'a.bundle',
      'a.bundle/b.bundle',
      'a.bundle/b.bundle/c.bundle TOO_DEEP',
    ]);
  });

  it('opens the same content once a walk', async () => {
    const inner = bundle({ 'main.c': 'int main' });
    const { unpack, job, listed } = run(
      bundle({ 'a/x.bundle': inner, 'b/x.bundle': inner }),
    );

    await unpack.run(job);

    expect(listed()).toEqual(['a/x.bundle', 'b/x.bundle', 'a/x.bundle/main.c']);
  });

  it('keeps what was listed of a broken container, the tree cut short', async () => {
    const { unpack, job, tree, listed } = run(lab, {
      async *unpack() {
        yield { path: 'a.c', content: text('a') };
        throw new Error('bad header\u0000in\na.c');
      },
    });

    await unpack.run(job);

    expect(listed()).toEqual(['a.c']);
    expect(tree()?.cutShort).toBe('the container: bad header in a.c');
  });

  it("cuts the tree short when a member's bytes break", async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('bad data'));
      },
    });
    const { unpack, job, tree } = run(
      lab,
      listing({ path: 'a.c', content: broken }),
    );

    await unpack.run(job);

    expect(tree()).toMatchObject({
      members: [],
      cutShort: 'the container: bad data',
    });
  });

  it('goes on with the containers in it after one is broken', async () => {
    const { unpack, job, tree, listed } = run(
      bundle({ 'a.bundle': 'not json', 'b.bundle': bundle({ 'm.c': 'x' }) }),
    );

    await unpack.run(job);

    expect(listed()).toEqual(['a.bundle', 'b.bundle', 'b.bundle/m.c']);
    expect(tree()?.cutShort).toMatch(/^a\.bundle: /);
  });

  it('lists no more members than the limit, the tree cut short', async () => {
    const { unpack, job, tree } = run(lab, {
      async *unpack() {
        for (let i = 0; i <= LIMITS.members; i++)
          yield { path: `m${i}.c`, content: text('x') };
      },
    });

    await unpack.run(job);

    expect(tree()?.members).toHaveLength(LIMITS.members);
    expect(tree()?.cutShort).toBe(`past ${LIMITS.members} members`);
  });

  // a pipeline that fails writing destroys the member with the write's error
  it("fails when the store does, saving no tree for a try that's retried", async () => {
    const full = Object.assign(new Error('ENOSPC: no space left on device'), {
      code: 'ENOSPC',
      syscall: 'write',
    });
    const { unpack, job, blobs, tree } = run();
    vi.spyOn(blobs, 'put').mockImplementation(async (content) => {
      content.destroy(full);
      throw full;
    });

    await expect(unpack.run(job)).rejects.toBe(full);
    expect(tree()).toBeUndefined();
  });

  it("fails when the container's bytes can't be read from the store", async () => {
    const lost = Object.assign(new Error('EIO: i/o error, read'), {
      code: 'EIO',
      syscall: 'read',
    });
    const { unpack, job, blobs, tree } = run();
    vi.spyOn(blobs, 'get').mockRejectedValue(lost);

    await expect(unpack.run(job)).rejects.toBe(lost);
    expect(tree()).toBeUndefined();
  });

  it('stops at its signal, saving no tree', async () => {
    const stopping = new AbortController();
    const { unpack, job, tree } = run(lab, {
      async *unpack({ signal }) {
        await once(new EventEmitter(), 'never', { signal });
        yield* [];
      },
    });

    const running = unpack.run(job, stopping.signal);
    stopping.abort('the app is shutting down');

    await expect(running).rejects.toBe('the app is shutting down');
    expect(tree()).toBeUndefined();
  });

  it("stops a member's bytes that stall at its signal", async () => {
    const stopping = new AbortController();
    const stalled = new Readable({ read() {} });
    const { unpack, job } = run(
      lab,
      listing({ path: 'a.c', content: stalled }),
    );

    const running = unpack.run(job, stopping.signal);
    await vi.waitFor(() => expect(stalled.readableFlowing).not.toBeNull());
    stopping.abort('the app is shutting down');

    await expect(running).rejects.toBe('the app is shutting down');
    expect(stalled.destroyed).toBe(true);
  });

  it('walks a current tree no more, queueing its processing again', async () => {
    const instance = new FakeUnpacker();
    const { unpack, job, queue } = run(lab, instance);
    await unpack.run(job);
    const walk = vi.spyOn(instance, 'unpack');
    queue.enqueued.length = 0;

    await unpack.run(job);

    expect(walk).not.toHaveBeenCalled();
    expect(queue.enqueued).toHaveLength(2);
  });

  it("walks again for another unpacker version or the hub's limits", async () => {
    const { unpack, job, unpackings, tree } = run(lab, undefined, 2);
    const old = { ...job.key, members: [], cutShort: null };
    await unpackings.save({ ...old, version: 1, policy: LIMITS.policy });

    await unpack.run(job);
    expect(tree()?.version).toBe(2);

    await unpackings.save({ ...old, policy: LIMITS.policy - 1 });
    await unpack.run(job);
    expect(tree()).toMatchObject({ policy: LIMITS.policy });
    expect(tree()?.members).toHaveLength(2);
  });

  it('leaves content no file of a type it takes holds, or a plugin turned off', async () => {
    const { unpack, job, files, tree } = run();
    files.files.set('f', { name: 'lab.txt', mime: null, hash: job.key.hash });

    await unpack.run(job);
    await unpack.run({
      ...job,
      key: { ...job.key, unpacker: PluginName.parse('gone') },
    });

    expect(tree()).toBeUndefined();
  });
});
