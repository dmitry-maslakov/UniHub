import type { ProcessesContent, ProcessorInput } from '@app/plugin-sdk';
import { MediaType, PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import { sha256 } from '../../../test/sha256.js';
import type { ProcessJob } from './plugin-job.js';
import { ProcessContent } from './process-content.js';
import {
  FakeFiles,
  FakeTextIndexQueue,
  holdersOf,
  InMemoryRepresentations,
} from './processing.fakes.js';

const lecture = '%PDF lecture';
const hash = sha256(lecture);
const mime = MediaType.parse('application/pdf');

const job = (version = 1): ProcessJob => ({
  kind: 'process',
  key: { hash, processor: PluginName.parse('pdf'), version },
});

// the files that hold the content now
function run(
  instance: ProcessesContent,
  files: { name: string; hash?: typeof hash }[] = [{ name: 'a.pdf' }],
  version = 1,
  heavy?: { timeoutMinutes: number },
) {
  const blobs = new InMemoryBlobs({ holding: [lecture] });
  const representations = new InMemoryRepresentations();
  const textIndex = new FakeTextIndexQueue();
  const process = new ProcessContent(
    catalogOf({
      processors: [processor('pdf', ['.pdf'], instance, version, heavy)],
    }),
    holdersOf(
      new FakeFiles(
        new Map(files.map((f, i) => [`f${i}`, { mime, hash, ...f }])),
      ),
    ),
    blobs,
    representations,
    textIndex,
  );
  return { process, blobs, saved: representations.saved, textIndex };
}

const parts = (...texts: string[]): ProcessesContent => ({
  process: async () => ({ parts: texts }),
});

describe('ProcessContent', () => {
  it('stores what the processor made, keyed by content and version', async () => {
    const { process, saved } = run(parts('page 1', 'page\u0000 2'));

    await process.run(job());

    expect(saved).toEqual([{ ...job().key, parts: ['page 1', 'page 2'] }]);
  });

  it("hands the processor the file's media type and the entry it matched", async () => {
    const seen: Pick<ProcessorInput, 'name' | 'mime' | 'matched'>[] = [];
    const { process } = run({
      process: async ({ name, mime, matched }) => {
        seen.push({ name, mime, matched });
        return { parts: [] };
      },
    });

    await process.run(job());

    expect(seen).toEqual([{ name: 'a.pdf', mime, matched: '.pdf' }]);
  });

  it('skips content no file holds any more', async () => {
    const process = vi.fn();
    const { process: p } = run({ process }, [
      { name: 'a.pdf', hash: sha256('newer') },
    ]);

    await p.run(job());

    expect(process).not.toHaveBeenCalled();
  });

  it('skips content whose files were renamed to what it does not take', async () => {
    const process = vi.fn();
    const { process: p } = run({ process }, [{ name: 'a.txt' }]);

    await p.run(job());

    expect(process).not.toHaveBeenCalled();
  });

  it('does content another file still holds as it takes it', async () => {
    const { process, saved } = run(parts('text'), [
      { name: 'renamed.txt' },
      { name: 'copy.pdf' },
    ]);

    await process.run(job());

    expect(saved).toHaveLength(1);
  });

  it('queues what it stored for the search index', async () => {
    const { process, textIndex } = run(parts('text'));

    await process.run(job());

    expect(textIndex.enqueued).toEqual([job().key]);
  });

  it('queues it again for content already done, in case that was lost', async () => {
    const { process, textIndex } = run(parts('text'));

    await process.run(job());
    await process.run(job());

    expect(textIndex.enqueued).toEqual([job().key, job().key]);
  });

  it('stores the same with search off, without the queue', async () => {
    const representations = new InMemoryRepresentations();
    const process = new ProcessContent(
      catalogOf({ processors: [processor('pdf', ['.pdf'], parts('text'))] }),
      holdersOf(
        new FakeFiles(new Map([['f0', { name: 'a.pdf', mime, hash }]])),
      ),
      new InMemoryBlobs({ holding: [lecture] }),
      representations,
    );

    await process.run(job());

    expect(representations.saved).toHaveLength(1);
  });

  it('skips a processor turned off since the job was queued', async () => {
    const representations = new InMemoryRepresentations();
    const process = new ProcessContent(
      catalogOf({}),
      holdersOf(new FakeFiles()),
      new InMemoryBlobs(),
      representations,
    );

    await process.run(job());

    expect(representations.saved).toEqual([]);
  });

  it('skips content this version already did', async () => {
    const instance = { process: vi.fn(async () => ({ parts: [] })) };
    const { process } = run(instance);

    await process.run(job());
    await process.run(job());

    expect(instance.process).toHaveBeenCalledTimes(1);
  });

  it('does a job queued for another version with the one running now', async () => {
    const { process, saved } = run(parts('v2'), undefined, 2);

    await process.run(job(1));

    expect(saved).toEqual([{ ...job(2).key, parts: ['v2'] }]);
  });

  it('closes the streams a processor opened, even when it fails', async () => {
    const { process, blobs } = run({
      process: async (input) => {
        await input.content();
        await input.content();
        throw new Error('broken pdf');
      },
    });

    await expect(process.run(job())).rejects.toThrow('broken pdf');

    expect(blobs.opened).toHaveLength(2);
    expect(blobs.opened.every((s) => s.destroyed)).toBe(true);
  });

  it('refuses content asked for after the run', async () => {
    let content: ProcessorInput['content'] | undefined;
    const { process, blobs } = run({
      process: async (input) => {
        content = () => input.content();
        return { parts: [] };
      },
    });
    await process.run(job());

    await expect(content!()).rejects.toThrow('after the run');
    expect(blobs.opened.every((s) => s.destroyed)).toBe(true);
  });

  describe('a heavy processor', () => {
    const heavy = { timeoutMinutes: 20 };

    afterEach(() => vi.restoreAllMocks());

    it('gets a signal that aborts at its time limit, an ordinary one none', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const seen: (AbortSignal | undefined)[] = [];
      const instance: ProcessesContent = {
        process: async ({ signal }) => {
          seen.push(signal);
          return { parts: [] };
        },
      };

      await run(instance, undefined, 1, heavy).process.run(job());
      await run(instance).process.run(job());

      expect(timeout).toHaveBeenCalledExactlyOnceWith(20 * 60_000);
      expect(seen[0]).toBeInstanceOf(AbortSignal);
      expect(seen[1]).toBeUndefined();
    });

    it('fails the job past its limit even if the processor ignores the signal', async () => {
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
        AbortSignal.abort(new DOMException('too slow', 'TimeoutError')),
      );
      const { process, saved } = run(
        { process: () => new Promise(() => {}) },
        undefined,
        1,
        heavy,
      );

      await expect(process.run(job())).rejects.toThrow('too slow');
      expect(saved).toEqual([]);
    });

    it('stops when the process shuts down', async () => {
      const shutdown = new AbortController();
      const { process } = run(
        { process: () => new Promise(() => {}) },
        undefined,
        1,
        heavy,
      );

      const done = process.run(job(), shutdown.signal);
      shutdown.abort('the app is shutting down');

      await expect(done).rejects.toBe('the app is shutting down');
    });
  });
});
