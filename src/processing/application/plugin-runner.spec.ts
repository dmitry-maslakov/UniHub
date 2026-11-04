import { PassThrough } from 'node:stream';
import type { QueryBus } from '@nestjs/cqrs';
import { FILE_CONTENT_STORED, type ProcessesContent } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import type { PluginRegistry } from '../../plugins/plugin-registry.js';
import type { RepresentationRepository } from '../domain/representation.js';
import type { PluginJob } from '../queues.js';
import { PluginRunner } from './plugin-runner.js';

const job = (hash: string): PluginJob => ({
  plugin: 'pdf',
  message: {
    topic: FILE_CONTENT_STORED,
    payload: { portal: 'p', fileId: 'f1', hash },
  },
});

function runner(
  processor: ProcessesContent,
  contentHash: string,
  existing = false,
  mime: string | null = null,
) {
  const streams: PassThrough[] = [];
  const registry = {
    runnable: () => ({
      kind: 'processor',
      plugin: { options: { name: 'pdf', version: 1 }, instance: processor },
    }),
  } as unknown as PluginRegistry;
  const queries = {
    execute: async (query: unknown) => {
      if (query instanceof GetFileQuery)
        return { name: 'a.pdf', mime, contentHash, removed: false };
      const stream = new PassThrough();
      streams.push(stream);
      return stream;
    },
  } as unknown as QueryBus;
  const saved: unknown[] = [];
  const representations = {
    exists: async () => existing,
    save: async (r: unknown) => void saved.push(r),
  } as unknown as RepresentationRepository;
  return {
    run: new PluginRunner(registry, queries, representations),
    streams,
    saved,
  };
}

describe('PluginRunner', () => {
  it('skips a job about content that has been replaced since', async () => {
    const process = vi.fn();
    const { run } = runner({ process }, 'new');

    await run.run(job('old'));

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
      'h',
    );

    await expect(run.run(job('h'))).rejects.toThrow('broken pdf');

    expect(streams).toHaveLength(2);
    expect(streams.every((s) => s.destroyed)).toBe(true);
  });

  it('stores what the processor made, keyed by content and version', async () => {
    const { run, saved } = runner(
      { process: async () => ({ parts: ['page 1'] }) },
      'h',
    );

    await run.run(job('h'));

    expect(saved).toEqual([
      { hash: 'h', processor: 'pdf', version: 1, parts: ['page 1'] },
    ]);
  });

  it('hands a processor the media type the registry matched on', async () => {
    const seen: (string | null)[] = [];
    const { run } = runner(
      {
        process: async ({ mime }) => {
          seen.push(mime);
          return { parts: [] };
        },
      },
      'h',
      false,
      'Application/PDF; charset=binary',
    );

    await run.run(job('h'));

    expect(seen).toEqual(['application/pdf']);
  });

  it('skips content this processor version already did', async () => {
    const process = vi.fn();
    const { run } = runner({ process }, 'h', true);

    await run.run(job('h'));

    expect(process).not.toHaveBeenCalled();
  });
});
