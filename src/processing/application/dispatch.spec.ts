import {
  FILE_CONTENT_STORED,
  ITEM_INGESTED,
  ITEM_REMOVED,
  type Message,
} from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import {
  aggregator,
  catalogOf,
  expander,
  processor,
} from '../../../test/discovered-plugins.js';
import { MAX_DEPTH } from '../domain/expansion.js';
import { Dispatch } from './dispatch.js';
import { jobId } from './plugin-job.js';
import { sha256 } from '../../../test/sha256.js';
import { FakeFiles } from './processing.fakes.js';

const portal = PortalId.parse('canvas');
const hash = sha256('notes');

const stored = (fileId: string, content = hash): Message => ({
  topic: FILE_CONTENT_STORED,
  payload: { portal, fileId, hash: content },
});

function dispatch() {
  const plugins = catalogOf({
    processors: [processor('pdf', ['.pdf']), processor('slides', ['.pptx'])],
    expanders: [expander('archives', ['.zip'])],
    aggregators: [
      aggregator('feed', [ITEM_INGESTED, ITEM_REMOVED]),
      aggregator('files', [FILE_CONTENT_STORED]),
    ],
  });
  const files = new FakeFiles(
    new Map([
      ['a', { name: 'a.pdf', mime: null, hash }],
      ['b', { name: 'b.pdf', mime: null, hash }],
    ]),
  );
  return new Dispatch(plugins, files);
}

describe('Dispatch', () => {
  it('gives a message to the aggregators of its topic', async () => {
    const message: Message = {
      topic: ITEM_INGESTED,
      payload: { portal, itemId: 'i1' },
    };

    expect(await dispatch().jobsFor('m1', message)).toEqual([
      { kind: 'handle', messageId: 'm1', aggregator: 'feed', message },
    ]);
  });

  it('gives stored content to each processor that takes the file', async () => {
    expect(await dispatch().jobsFor('m1', stored('a'))).toEqual([
      { kind: 'process', key: { hash, processor: 'pdf', version: 1 } },
      {
        kind: 'handle',
        messageId: 'm1',
        aggregator: 'files',
        message: stored('a'),
      },
    ]);
  });

  it('queues no processing for a file that is gone', async () => {
    const jobs = await dispatch().jobsFor('m1', stored('gone'));
    expect(jobs.map((job) => job.kind)).toEqual(['handle']);
  });

  it('queues no processing of content the file holds no more', async () => {
    const jobs = await dispatch().jobsFor('m1', stored('a', sha256('old')));
    expect(jobs.map((job) => job.kind)).toEqual(['handle']);
  });

  it("gives a name's content to the expanders that take it, while it's less than MAX_DEPTH deep", async () => {
    const d = dispatch();
    const named = (depth: number) => ({
      name: 'lab/labs.zip',
      mime: null,
      hash,
      depth,
    });

    expect(d.jobs(named(MAX_DEPTH - 1))).toEqual([
      { kind: 'expand', key: { hash, expander: 'archives', version: 1 } },
    ]);
    expect(d.jobs(named(MAX_DEPTH))).toEqual([]);
    expect(
      d.jobs({ name: 'lab/l1.pdf', mime: null, hash, depth: MAX_DEPTH }),
    ).toEqual([
      { kind: 'process', key: { hash, processor: 'pdf', version: 1 } },
    ]);
  });

  it('gives the same work one id, from any message or file', async () => {
    const d = dispatch();
    const [a] = await d.jobsFor('m1', stored('a'));
    const [b] = await d.jobsFor('m2', stored('b'));
    const [, handle] = await d.jobsFor('m2', stored('b'));

    expect(jobId(a)).toBe(`${hash}__pdf__1`);
    expect(jobId(b)).toBe(jobId(a));
    expect(jobId(handle)).toBe('m2__files');
  });
});
