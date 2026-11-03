import { PassThrough } from 'node:stream';
import type { QueryBus } from '@nestjs/cqrs';
import { FILE_CONTENT_STORED, type ProcessesContent } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import type { PluginRegistry } from '../../plugins/plugin-registry.js';
import type { PluginJob } from '../queues.js';
import { PluginRunner } from './plugin-runner.js';

const job = (hash: string): PluginJob => ({
  plugin: 'pdf',
  message: {
    topic: FILE_CONTENT_STORED,
    payload: { portal: 'p', fileId: 'f1', hash },
  },
});

function runner(processor: ProcessesContent, contentHash: string) {
  const streams: PassThrough[] = [];
  const registry = {
    runnable: () => ({
      kind: 'processor',
      plugin: { options: { name: 'pdf' }, instance: processor },
    }),
  } as unknown as PluginRegistry;
  const queries = {
    execute: async (query: unknown) => {
      if (query instanceof GetFileQuery)
        return { name: 'a.pdf', mime: null, contentHash, removed: false };
      const stream = new PassThrough();
      streams.push(stream);
      return stream;
    },
  } as unknown as QueryBus;
  return { run: new PluginRunner(registry, queries), streams };
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
});
