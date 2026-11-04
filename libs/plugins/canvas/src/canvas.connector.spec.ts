import { Logger } from '@nestjs/common';
import { http } from 'msw';
import type { MockInstance } from 'vitest';
import { PortalId } from '@app/plugin-sdk';
import { CanvasConnector, WARN_BEFORE_MS } from './canvas.connector.js';
import { CANVAS_URL, FakeCanvas, refusal, TOKEN } from './canvas.fakes.js';
import { TokenRejectedError } from './errors.js';
import { RecordingIngest } from './ingest.fakes.js';

const canvas = new FakeCanvas().listen();
const COURSE = '/api/v1/courses/101';
const TOKEN_PATH = '/api/v1/users/self/tokens/1~abc';

const run = (
  ingest: RecordingIngest,
  { signal = new AbortController().signal, token = TOKEN } = {},
) =>
  new CanvasConnector({ url: CANVAS_URL, token, userAgent: 'test' }).poll({
    connection: { portal: PortalId.parse('canvas'), account: 'shared' },
    ingest,
    signal,
  });

const without = (path: string, id: number) => {
  const all = canvas.answers[path] as { id: number }[];
  canvas.answers[path] = all.filter((one) => one.id !== id);
};

describe('CanvasConnector', () => {
  let warn: MockInstance<Logger['warn']>;
  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('reads the open courses in the order their records refer to each other', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);

    expect([...ingest.courses.values()].map((c) => c.name)).toEqual([
      'Operating Systems',
    ]);
    expect(canvas.asked.filter((path) => path.startsWith('/'))).toEqual([
      TOKEN_PATH,
      '/api/v1/courses',
      `${COURSE}/tabs`,
      `${COURSE}/modules`,
      `${COURSE}/discussion_topics`,
      `${COURSE}/pages`,
      // the syllabus, which a module links to as well, came with the list
      `${COURSE}/pages/lab-1`,
      `${COURSE}/assignments`,
      `${COURSE}/folders`,
      `${COURSE}/files`,
    ]);
    expect([...ingest.items.keys()]).toEqual([
      'module:501',
      'topic:701',
      'page:801',
      'page:802',
      'assignment:901',
    ]);
  });

  it('leaves out what only some of the course see, and how the user stands', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);

    expect(ingest.items.has('topic:702')).toBe(false);
    expect(ingest.items.has('assignment:902')).toBe(false);
    const raw = ingest.items.get('topic:701')!.raw;
    expect(raw).toMatchObject({ message: '<p>The schedule is attached.</p>' });
    expect(raw).not.toHaveProperty('read_state');
    expect(raw).not.toHaveProperty('subscribed');
  });

  it('sends every file, and downloads what the hub has no content for', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);

    expect(ingest.files.get('3002')).toMatchObject({
      item: 'topic:701',
      path: 'unfiled',
    });
    expect(ingest.files.get('3001')).toMatchObject({
      path: 'Lectures',
      url: `${CANVAS_URL}/courses/101/files/3001`,
    });
    // locked for the user until some date: no content yet
    expect(ingest.files.has('3003')).toBe(true);
    expect(Object.fromEntries(ingest.contents)).toEqual({
      '3001': '%PDF lecture one',
      '3002': '%PDF schedule',
    });

    canvas.asked = [];
    await run(ingest);
    expect(canvas.asked.filter((path) => path.startsWith('download'))).toEqual(
      [],
    );
  });

  it('reads the pages and files modules link to when their tabs are hidden', async () => {
    canvas.answers[`${COURSE}/tabs`] = [
      { id: 'home' },
      { id: 'modules' },
      { id: 'pages', hidden: true },
    ];
    const ingest = new RecordingIngest();
    await run(ingest);

    for (const listing of ['pages', 'folders', 'files'])
      expect(canvas.asked).not.toContain(`${COURSE}/${listing}`);
    expect(canvas.asked).toEqual(
      expect.arrayContaining([
        `${COURSE}/pages/syllabus`,
        `${COURSE}/pages/lab-1`,
        `${COURSE}/files/3001`,
      ]),
    );
    expect([...ingest.items.keys()]).toEqual(
      expect.arrayContaining(['page:801', 'page:802']),
    );
    expect([...ingest.files.keys()].sort()).toEqual(['3001', '3002']);
  });

  it('removes what a listing that went through no longer has', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);
    without(`${COURSE}/assignments`, 901);
    without(`${COURSE}/files`, 3003);

    await run(ingest);
    expect(ingest.removedItems).toEqual(['assignment:901']);
    expect(ingest.removedFiles).toEqual(['3003']);
  });

  it('removes nothing for a listing refused or a tab hidden since', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);
    canvas.answers[`${COURSE}/assignments`] = 401;
    canvas.answers[`${COURSE}/tabs`] = [{ id: 'modules' }];

    await run(ingest);
    expect(ingest.removedItems).toEqual([]);
    expect(ingest.removedFiles).toEqual([]);

    // what the refused listing had is still known when it goes through
    canvas.answers[`${COURSE}/assignments`] = [];
    await run(ingest);
    expect(ingest.removedItems).toEqual(['assignment:901']);
  });

  it('removes nothing from a run cut short, and the next goes on', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);
    without(`${COURSE}/assignments`, 901);
    const stop = new AbortController();
    canvas.server.use(
      http.get(`${CANVAS_URL}${COURSE}/folders`, () => {
        stop.abort(new Error('the app is shutting down'));
        return refusal(500);
      }),
    );

    await expect(run(ingest, { signal: stop.signal })).rejects.toThrow(
      'shutting down',
    );
    expect(ingest.removedItems).toEqual([]);

    canvas.server.resetHandlers();
    await run(ingest);
    expect(ingest.removedItems).toEqual(['assignment:901']);
  });

  it('skips a file whose download Canvas refuses, and goes on', async () => {
    canvas.server.use(
      http.get(`${CANVAS_URL}/files/3002/download`, () => refusal(404)),
    );
    const ingest = new RecordingIngest();
    await run(ingest);

    expect([...ingest.contents.keys()]).toEqual(['3001']);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^file 3002/));
  });

  it('warns two weeks before the token expires', async () => {
    const expiring = (ms: number) => ({
      expires_at: new Date(Date.now() + ms).toISOString(),
    });
    const expiryWarnings = () =>
      warn.mock.calls.filter(([message]) =>
        /token expires/.test(String(message)),
      );

    canvas.answers[TOKEN_PATH] = expiring(WARN_BEFORE_MS + 60 * 60_000);
    await run(new RecordingIngest());
    expect(expiryWarnings()).toEqual([]);

    canvas.answers[TOKEN_PATH] = expiring(WARN_BEFORE_MS - 60 * 60_000);
    await run(new RecordingIngest());
    expect(expiryWarnings()).toHaveLength(1);
  });

  it('goes on unwarned when Canvas finds no token by its hint', async () => {
    delete canvas.answers[TOKEN_PATH];
    const ingest = new RecordingIngest();
    await run(ingest);

    expect(warn).not.toHaveBeenCalled();
    expect(ingest.courses.size).toBe(1);
  });

  it('fails the run, saying why, when Canvas no longer takes the token', async () => {
    const ingest = new RecordingIngest();
    const failed = run(ingest, { token: '1~revoked' });

    await expect(failed).rejects.toBeInstanceOf(TokenRejectedError);
    await expect(failed).rejects.toThrow(/expired or was revoked/);
    expect(ingest.courses.size).toBe(0);
  });
});
