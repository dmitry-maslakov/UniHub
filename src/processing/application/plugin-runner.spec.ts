import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { QueryBus } from '@nestjs/cqrs';
import {
  FILE_CONTENT_STORED,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { ContentHash, MediaType, PluginName, PortalId } from '@app/kernel';
import type { PluginCatalog } from '../../plugins/contracts.js';
import type { BlobStore } from '../../storage/contracts.js';
import type { RepresentationRepository } from '../domain/representation.js';
import type { PluginJob } from '../queues.js';
import { PluginRunner } from './plugin-runner.js';

const sha = (text: string) =>
  ContentHash.parse(createHash('sha256').update(text).digest('hex'));

const job = (hash: ContentHash): PluginJob => ({
  plugin: PluginName.parse('pdf'),
  message: {
    topic: FILE_CONTENT_STORED,
    payload: { portal: PortalId.parse('p'), fileId: 'f1', hash },
  },
});

function runner(
  processor: ProcessesContent,
  contentHash: ContentHash,
  { existing = false, matched = '.pdf' as string | null } = {},
) {
  const streams: PassThrough[] = [];
  const plugins = {
    aggregator: () => undefined,
    processor: () => ({
      spec: { name: 'pdf', version: 1, match: () => matched },
      instance: processor,
    }),
  } as unknown as PluginCatalog;
  // GetFileQuery, the only query it sends
  const mime = MediaType.parse('application/pdf');
  const queries = {
    execute: async () => ({ name: 'a.pdf', mime, contentHash, removed: false }),
  } as unknown as QueryBus;
  const blobs = {
    get: async () => {
      const stream = new PassThrough();
      streams.push(stream);
      return stream;
    },
  } as unknown as BlobStore;
  const saved: unknown[] = [];
  const representations = {
    exists: async () => existing,
    save: async (r: unknown) => void saved.push(r),
  } as unknown as RepresentationRepository;
  return {
    run: new PluginRunner(plugins, queries, blobs, representations),
    streams,
    saved,
  };
}

describe('PluginRunner', () => {
  const hash = sha('content');

  it('skips a job about content that has been replaced since', async () => {
    const process = vi.fn();
    const { run } = runner({ process }, sha('new'));

    await run.run(job(sha('old')));

    expect(process).not.toHaveBeenCalled();
  });

  it('closes the streams a processor opened, even when it fails', async () => {
    const { run, streams } = runner(
      {
        process: async (input) => {
          await input.content();
          await input.content();
          throw new Error('broken pdf');
        },
      },
      hash,
    );

    await expect(run.run(job(hash))).rejects.toThrow('broken pdf');

    expect(streams).toHaveLength(2);
    expect(streams.every((s) => s.destroyed)).toBe(true);
  });

  it('stores what the processor made, keyed by content and version', async () => {
    const { run, saved } = runner(
      { process: async () => ({ parts: ['page 1'] }) },
      hash,
    );

    await run.run(job(hash));

    expect(saved).toEqual([
      { hash, processor: 'pdf', version: 1, parts: ['page 1'] },
    ]);
  });

  it("hands a processor the file's media type and the entry it matched", async () => {
    const seen: Pick<ProcessorInput, 'mime' | 'matched'>[] = [];
    const { run } = runner(
      {
        process: async ({ mime, matched }) => {
          seen.push({ mime, matched });
          return { parts: [] };
        },
      },
      hash,
    );

    await run.run(job(hash));

    expect(seen).toEqual([{ mime: 'application/pdf', matched: '.pdf' }]);
  });

  it('skips a file renamed since to something the processor does not take', async () => {
    const process = vi.fn();
    const { run } = runner({ process }, hash, { matched: null });

    await run.run(job(hash));

    expect(process).not.toHaveBeenCalled();
  });

  it('skips content this processor version already did', async () => {
    const process = vi.fn();
    const { run } = runner({ process }, hash, { existing: true });

    await run.run(job(hash));

    expect(process).not.toHaveBeenCalled();
  });
});
