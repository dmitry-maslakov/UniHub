import { Readable } from 'node:stream';
import type {
  ExpandedEntry,
  ExpandsContent,
  ProcessorInput,
} from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import {
  catalogOf,
  expander,
  processor,
} from '../../../test/discovered-plugins.js';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import { sha256 } from '../../../test/sha256.js';
import { MAX_DEPTH } from '../domain/expansion.js';
import { Dispatch } from './dispatch.js';
import { ExpandContent } from './expand-content.js';
import type { ExpandJob } from './plugin-job.js';
import {
  FakeFiles,
  FakeQueue,
  InMemoryExpansions,
  namesOf,
} from './processing.fakes.js';

const archive = 'PK labs';
const hash = sha256(archive);
const archives = PluginName.parse('archives');

const job = (version = 1): ExpandJob => ({
  kind: 'expand',
  key: { hash, expander: archives, version },
});

const file = (path: string, text: string, size?: number): ExpandedEntry => ({
  path,
  size,
  content: async () => Readable.from([Buffer.from(text)]),
});

const listing = async function* (entries: ExpandedEntry[]) {
  yield* entries;
};

const yielding = (...entries: ExpandedEntry[]): ExpandsContent => ({
  expand: () => listing(entries),
});

// labs.zip holds the content, unless other files are given
function run(
  instance: ExpandsContent,
  {
    files = { 'labs.zip': hash } as Record<string, typeof hash>,
    version = 1,
    maxBytes = 1024,
  } = {},
) {
  const plugins = catalogOf({
    processors: [processor('text', ['.c'])],
    expanders: [expander('archives', ['.zip'], instance, version)],
  });
  const facts = new FakeFiles(
    new Map(
      Object.entries(files).map(([name, of]) => [
        name,
        { name, mime: null, hash: of },
      ]),
    ),
  );
  const blobs = new InMemoryBlobs({ maxBytes, holding: [archive] });
  const expansions = new InMemoryExpansions();
  const queue = new FakeQueue();
  const expand = new ExpandContent(
    plugins,
    namesOf(facts, plugins, expansions),
    blobs,
    expansions,
    new Dispatch(plugins, facts),
    queue,
  );
  return { expand, blobs, expansions, queue };
}

describe('ExpandContent', () => {
  it("stores each entry as a content and the expansion, then queues the entries' jobs by their paths", async () => {
    const { expand, blobs, expansions, queue } = run(
      yielding(
        file('lab/main.c', 'int main;\n', 10),
        file('inner.zip', 'PK inner'),
        file('photo.png', 'PNG'),
      ),
    );

    await expand.run(job());

    const entries = [
      { path: 'lab/main.c', hash: sha256('int main;\n'), size: 10 },
      { path: 'inner.zip', hash: sha256('PK inner'), size: 8 },
      { path: 'photo.png', hash: sha256('PNG'), size: 3 },
    ];
    expect(expansions.saved).toEqual([{ ...job().key, entries }]);
    expect(blobs.stored.get(sha256('int main;\n'))?.toString()).toBe(
      'int main;\n',
    );
    expect(queue.enqueued).toEqual([
      {
        kind: 'process',
        key: { hash: entries[0].hash, processor: 'text', version: 1 },
      },
      {
        kind: 'expand',
        key: { hash: entries[1].hash, expander: 'archives', version: 1 },
      },
    ]);
  });

  it("hands the expander the archive's name, media type and the entry it matched", async () => {
    const seen: Pick<ProcessorInput, 'name' | 'mime' | 'matched'>[] = [];
    const { expand } = run({
      expand: ({ name, mime, matched }) => {
        seen.push({ name, mime, matched });
        return listing([]);
      },
    });

    await expand.run(job());

    expect(seen).toEqual([{ name: 'labs.zip', mime: null, matched: '.zip' }]);
  });

  it('leaves out an entry past what storage keeps, said or found, and goes on', async () => {
    const big = vi.fn(async () => Readable.from([Buffer.alloc(20)]));
    const { expand, expansions } = run(
      yielding(
        { path: 'said.bin', size: 20, content: big },
        file('found.bin', 'x'.repeat(20)),
        file('fits.c', 'int;\n'),
      ),
      { maxBytes: 16 },
    );

    await expand.run(job());

    expect(big).not.toHaveBeenCalled();
    expect(expansions.saved[0].entries.map(({ path }) => path)).toEqual([
      'fits.c',
    ]);
  });

  it('expands no content that goes by no name the expander takes', async () => {
    const instance = { expand: vi.fn(() => listing([])) };

    await run(instance, { files: { 'labs.bin': hash } }).expand.run(job());
    await run(instance, { files: {} }).expand.run(job());

    expect(instance.expand).not.toHaveBeenCalled();
  });

  it.each([
    [MAX_DEPTH - 1, 1],
    [MAX_DEPTH, 0],
  ])('expands an archive %i deep %i times', async (depth, times) => {
    const instance = { expand: vi.fn(() => listing([])) };
    const outer = Array.from({ length: depth }, (_, i) => sha256(`${i}.zip`));
    // the content in 0.zip in 1.zip..., the last one a file
    const { expand, expansions } = run(instance, {
      files: { 'top.zip': outer.at(-1)! },
    });
    for (const [i, of] of outer.entries())
      await expansions.save({
        hash: of,
        expander: archives,
        version: 1,
        entries: [{ path: 'in.zip', hash: outer[i - 1] ?? hash, size: 1 }],
      });

    await expand.run(job());

    expect(instance.expand).toHaveBeenCalledTimes(times);
  });

  it('skips an expander turned off since the job was queued', async () => {
    const expansions = new InMemoryExpansions();
    const plugins = catalogOf({});
    const facts = new FakeFiles();
    await new ExpandContent(
      plugins,
      namesOf(facts, plugins, expansions),
      new InMemoryBlobs(),
      expansions,
      new Dispatch(plugins, facts),
      new FakeQueue(),
    ).run(job());

    expect(expansions.saved).toEqual([]);
  });

  it("expands content once, queueing its entries' jobs again in case that was lost", async () => {
    const instance = { expand: vi.fn(() => listing([file('a.c', 'a')])) };
    const { expand, queue } = run(instance);

    await expand.run(job());
    await expand.run(job());

    expect(instance.expand).toHaveBeenCalledTimes(1);
    expect(queue.enqueued).toHaveLength(2);
  });

  it('does a job queued for another version with the one running now', async () => {
    const { expand, expansions } = run(yielding(), { version: 2 });

    await expand.run(job(1));

    expect(expansions.saved).toEqual([{ ...job(2).key, entries: [] }]);
  });

  it('closes the streams it opened and saves nothing when the expander fails', async () => {
    const { expand, blobs, expansions } = run({
      async *expand(input) {
        await input.content();
        yield file('a.c', 'a');
        throw new Error('broken zip');
      },
    });

    await expect(expand.run(job())).rejects.toThrow('broken zip');

    expect(blobs.opened.every((stream) => stream.destroyed)).toBe(true);
    expect(expansions.saved).toEqual([]);
  });
});
