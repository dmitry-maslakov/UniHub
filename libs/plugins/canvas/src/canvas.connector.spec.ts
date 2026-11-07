import { Logger } from '@nestjs/common';
import { http, HttpResponse, passthrough } from 'msw';
import type { MockInstance } from 'vitest';
import {
  CredentialRejectedError,
  Instance,
  PortalId,
  Secret,
  TokensNotAllowedError,
  type Credential,
} from '@app/plugin-sdk';
import { CanvasConnector, WARN_BEFORE_MS } from './canvas.connector.js';
import {
  CANVAS_URL,
  CuttingFileStore,
  FakeCanvas,
  refusal,
  TOKEN,
} from './canvas.fakes.js';
import { CanvasError, NotCanvasError, TokenRejectedError } from './errors.js';
import { hostedByInstructure } from './instructure.js';
import { RecordingIngest } from './ingest.fakes.js';
import { SyncState } from './listings.js';

// the file store listens on loopback (CuttingFileStore)
vi.mock('request-filtering-agent', async (original) =>
  (await import('./canvas.fakes.js')).letInLoopback(original),
);
// no DNS in a spec: its own spec checks the CNAMEs
vi.mock('./instructure.js', () => ({
  hostedByInstructure: vi.fn(async () => false),
}));

const canvas = new FakeCanvas().listen();
const store = new CuttingFileStore().listen();
const COURSE = '/api/v1/courses/101';
const TOKEN_PATH = '/api/v1/users/self/tokens/1~abc';

const portal = PortalId.parse('canvas');
const SITE = Instance.parse(CANVAS_URL);
const connector = (token: string | null = TOKEN, url: Instance | null = SITE) =>
  new CanvasConnector({ url, token, userAgent: 'test' });
// the shared account's run, on the owner's token
const run = (
  ingest: RecordingIngest,
  { signal = new AbortController().signal, token = TOKEN } = {},
) =>
  connector(token).poll({
    connection: { portal, account: 'shared' },
    account: { kind: 'shared' },
    ingest,
    signal,
  });
// a user's own account's, on their token of the Canvas they linked it
// with; the owner's is none, and so is the school's address
const runAs = (
  ingest: RecordingIngest,
  token = TOKEN,
  { url = SITE as Instance | null, school = null as Instance | null } = {},
) =>
  connector(null, school).poll({
    connection: { portal, account: 'a-1' },
    account: {
      kind: 'user',
      credential: async () => ({
        kind: 'token',
        token: new Secret(token),
        ...(url && { url }),
      }),
    },
    ingest,
    signal: new AbortController().signal,
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

    expect([...ingest.listedCourses.values()].map((c) => c.name)).toEqual([
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

  it("asks for no module item's details, which hold the user's own dates", async () => {
    const urls: string[] = [];
    canvas.server.events.on('request:start', ({ request }) => {
      urls.push(request.url);
    });
    await run(new RecordingIngest());
    canvas.server.events.removeAllListeners();

    expect(urls).toContain(
      `${CANVAS_URL}${COURSE}/modules?include[]=items&per_page=100`,
    );
    expect(urls.join(' ')).not.toContain('content_details');
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

  it('reads on past a page or a file a module links to that is refused', async () => {
    canvas.answers[`${COURSE}/tabs`] = [{ id: 'modules' }];
    canvas.answers[`${COURSE}/pages/syllabus`] = 403;
    canvas.answers[`${COURSE}/files/3001`] = 404;
    const ingest = new RecordingIngest();
    await run(ingest);

    expect(ingest.items.has('page:801')).toBe(false);
    expect(ingest.items.has('page:802')).toBe(true);
    // not all there this run: what these sources had stays
    const { items, files } = SyncState.parse(ingest.saved).courses['101'];
    expect(items).not.toHaveProperty('module-pages');
    expect(files).not.toHaveProperty('module-files');
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

  it('removes on the next run what was gone when the end failed', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);
    without(`${COURSE}/assignments`, 901);
    ingest.failingEnds = 1;

    await expect(run(ingest)).rejects.toThrow('the database is away');
    expect(ingest.removedItems).toEqual([]);
    await run(ingest);
    expect(ingest.removedItems).toEqual(['assignment:901']);
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

  it('takes nothing away for a listing that fails with none saved before, its state lost', async () => {
    const ingest = new RecordingIngest();
    await run(ingest);
    ingest.saved = null;
    canvas.answers[`${COURSE}/assignments`] = 401;

    await run(ingest);
    expect(ingest.removedItems).toEqual([]);
    expect(ingest.items.has('assignment:901')).toBe(true);
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

  it('skips a file whose download Canvas refuses or fails, and goes on', async () => {
    for (const status of [404, 422]) {
      canvas.server.use(
        http.get(`${CANVAS_URL}/files/3002/download`, () => refusal(status)),
      );
      const ingest = new RecordingIngest();
      await run(ingest);
      expect([...ingest.contents.keys()]).toEqual(['3001']);
    }

    const skips = warn.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith('file 3002'));
    expect(skips).toEqual([
      expect.stringContaining('answered 404'),
      expect.stringContaining('answered 422'),
    ]);
  });

  it('skips a file whose download is cut off partway, and goes on', async () => {
    canvas.server.use(
      http.get(`${CANVAS_URL}/files/3001/download`, () =>
        HttpResponse.redirect(`${store.url}/3001`, 302),
      ),
      http.get(`${store.url}/*`, () => passthrough()),
    );
    const ingest = new RecordingIngest();
    await run(ingest);

    expect([...ingest.contents.keys()]).toEqual(['3002']);
    expect(warn).toHaveBeenCalledWith(
      'file 3001 skipped: download of /files/3001/download failed: aborted',
    );
  });

  it('skips a course Canvas fails on, goes on, and fails the run at the end', async () => {
    (canvas.answers['/api/v1/courses'] as object[]).push({
      id: 103,
      name: 'Networks',
      course_code: 'NET-2026',
      start_at: null,
      end_at: null,
    });
    canvas.answers[`${COURSE}/assignments`] = 400;
    const ingest = new RecordingIngest();

    await expect(run(ingest)).rejects.toThrow('canvas courses 101 skipped');
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^course 101 skipped: canvas answered 400/),
    );
    expect(ingest.listedCourses.has('103')).toBe(true);
    // course 101's listings as they were, so nothing of it is taken for gone
    expect(ingest.saved).toEqual({
      courses: { '103': { items: {}, files: {} } },
    });
  });

  it('skips a course whose record the hub refuses, goes on, and fails the run at the end', async () => {
    (canvas.answers['/api/v1/courses'] as object[]).push({
      id: 103,
      name: 'Networks',
      course_code: 'NET-2026',
      start_at: null,
      end_at: null,
    });
    const ingest = new RecordingIngest();
    ingest.refusing.add('101');

    await expect(run(ingest)).rejects.toThrow('canvas courses 101 skipped');
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/^course 101 skipped: /),
    );
    expect(canvas.asked).not.toContain(`${COURSE}/tabs`);
    expect([...ingest.listedCourses.keys()]).toEqual(['103']);
    expect(ingest.saved).toEqual({
      courses: { '103': { items: {}, files: {} } },
    });
  });

  it('stops at a token Canvas no longer takes, in the middle of a run too', async () => {
    canvas.server.use(
      http.get(`${CANVAS_URL}${COURSE}/assignments`, () =>
        HttpResponse.json(
          { errors: [{ message: 'Invalid access token.' }] },
          {
            status: 401,
            headers: { 'www-authenticate': 'Bearer realm="canvas-lms"' },
          },
        ),
      ),
    );
    const ingest = new RecordingIngest();

    await expect(run(ingest)).rejects.toBeInstanceOf(TokenRejectedError);
    expect(ingest.saved).toBeNull();
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
    expect(ingest.listedCourses.size).toBe(1);
  });

  it('fails the run, saying why, when Canvas no longer takes the token', async () => {
    const ingest = new RecordingIngest();
    const failed = run(ingest, { token: '1~revoked' });

    await expect(failed).rejects.toBeInstanceOf(TokenRejectedError);
    await expect(failed).rejects.toThrow(/expired or was revoked/);
    expect(ingest.listedCourses.size).toBe(0);
  });
});

describe("CanvasConnector, on a user's own token", () => {
  let warn: MockInstance<Logger['warn']>;
  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('reads each course as the user sees it: what some of it see, the dates as they are for the user', async () => {
    const ingest = new RecordingIngest();
    await runAs(ingest);

    expect(ingest.items.has('topic:702')).toBe(true);
    expect(ingest.items.has('assignment:902')).toBe(true);
    expect(canvas.asked).toContain(`${COURSE}/assignments`);
    const urls: string[] = [];
    canvas.server.events.on('request:start', ({ request }) => {
      urls.push(request.url);
    });
    await runAs(new RecordingIngest());
    canvas.server.events.removeAllListeners();
    expect(urls.join(' ')).not.toContain('override_assignment_dates');
    // how the user stands still stays out, and so does what a module lists
    expect(ingest.items.get('topic:701')!.raw).not.toHaveProperty('read_state');
    expect(ingest.items.get('module:501')!.raw).not.toHaveProperty('items');
    // the owner's token isn't asked about
    expect(canvas.asked).not.toContain(TOKEN_PATH);
  });

  it('sends a file locked for the user as locked, and downloads what the hub asks for after the pass', async () => {
    const ingest = new RecordingIngest();
    await runAs(ingest);

    expect([...ingest.locked]).toEqual(['3003']);
    expect([...ingest.contents.keys()].sort()).toEqual(['3001', '3002']);
    canvas.asked = [];
    await runAs(ingest);
    expect(canvas.asked.filter((path) => path.startsWith('download'))).toEqual(
      [],
    );
  });

  it("downloads once every course's pass has ended, so when one ends says nothing of another's files", async () => {
    (canvas.answers['/api/v1/courses'] as object[]).push({
      id: 103,
      name: 'Networks',
      course_code: 'NET-2026',
      start_at: null,
      end_at: null,
    });
    const ingest = new RecordingIngest();
    await runAs(ingest);

    expect(ingest.log.slice(0, 2)).toEqual(['end 101', 'end 103']);
    expect(ingest.log.slice(2).sort()).toEqual([
      'content 3001',
      'content 3002',
    ]);
  });

  it('takes nothing out of the view of a course whose record the hub refuses, and keeps its listings', async () => {
    const ingest = new RecordingIngest();
    await runAs(ingest);
    const saved = structuredClone(ingest.saved);
    without(`${COURSE}/assignments`, 901);
    ingest.refusing.add('101');

    await expect(runAs(ingest)).rejects.toThrow('canvas courses 101 skipped');
    expect(ingest.removedItems).toEqual([]);
    expect(ingest.items.has('assignment:901')).toBe(true);
    expect(ingest.saved).toEqual(saved);
  });

  it('leaves out of the view what a listing that went through no longer has, and a course the user left', async () => {
    const ingest = new RecordingIngest();
    await runAs(ingest);
    without(`${COURSE}/assignments`, 901);
    await runAs(ingest);
    expect(ingest.removedItems).toEqual(['assignment:901']);

    canvas.answers['/api/v1/courses'] = [];
    await runAs(ingest);
    expect(ingest.listedCourses.size).toBe(0);
  });

  it('reads the Canvas an account linked before accounts kept theirs as the school’s', async () => {
    const ingest = new RecordingIngest();
    await runAs(ingest, TOKEN, { url: null, school: SITE });
    expect(ingest.listedCourses.size).toBe(1);

    await expect(
      runAs(new RecordingIngest(), TOKEN, { url: null }),
    ).rejects.toThrow(/link it again/);
  });

  it('takes a token Canvas no longer takes for the credential rejected', async () => {
    await expect(runAs(new RecordingIngest(), '1~revoked')).rejects.toThrow(
      CredentialRejectedError,
    );
  });

  it("refuses to read as shared without the owner's token and school", async () => {
    for (const shared of [connector(null), connector(TOKEN, null)])
      await expect(
        shared.poll({
          connection: { portal, account: 'shared' },
          account: { kind: 'shared' },
          ingest: new RecordingIngest(),
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(/set CANVAS_URL and CANVAS_TOKEN/);
  });

  it('says the Canvas it reads as shared is the school’s', () => {
    expect(connector().configuredInstance()).toBe(SITE);
    expect(connector(null, null).configuredInstance()).toBeNull();
  });
});

describe('CanvasConnector, as a user links a token', () => {
  // The owner's token is another, which Canvas doesn't take, and the
  // school's another Canvas: each goes with its own requests, to the Canvas
  // the user named.
  const identify = (token = TOKEN, url: Instance = SITE) =>
    new CanvasConnector({
      url: Instance.parse('https://other.example.edu'),
      token: '1~the-owners-own',
      userAgent: 'test',
    }).identify(
      { kind: 'token', token: new Secret(token), url } satisfies Credential,
      new AbortController().signal,
    );

  it("says whose it is by Canvas's id alone, and when it expires", async () => {
    const found = await identify();

    expect(found).toEqual({
      id: '4242',
      expiresAt: new Date('2026-12-30T08:00:00Z'),
    });
    expect(canvas.asked).toEqual(['/api/v1/users/self', TOKEN_PATH]);
  });

  it("takes one that never expires, or whose expiry Canvas won't show", async () => {
    canvas.answers[TOKEN_PATH] = { expires_at: null };
    expect((await identify()).expiresAt).toBeNull();
    delete canvas.answers[TOKEN_PATH];
    expect(await identify()).toEqual({ id: '4242', expiresAt: null });
  });

  it("rejects one Canvas doesn't take", async () => {
    await expect(identify('1~revoked')).rejects.toBeInstanceOf(
      CredentialRejectedError,
    );
  });

  it('takes an address where no Canvas shows the user for no Canvas, rejecting nothing', async () => {
    for (const answer of [403, 404, { name: 'not a canvas user' }]) {
      canvas.answers['/api/v1/users/self'] = answer;
      await expect(identify()).rejects.toBeInstanceOf(NotCanvasError);
    }
  });

  it('sends no token to a Canvas that Instructure hosts, asked within the wait for an answer', async () => {
    vi.mocked(hostedByInstructure).mockResolvedValueOnce(true);
    await expect(identify()).rejects.toBeInstanceOf(TokensNotAllowedError);
    expect(vi.mocked(hostedByInstructure)).toHaveBeenCalledWith(
      SITE,
      expect.any(AbortSignal),
    );
    expect(canvas.asked).toEqual([]);
  });

  it('fails as Canvas does otherwise, rejecting nothing', async () => {
    canvas.answers['/api/v1/users/self'] = 400;
    await expect(identify()).rejects.toBeInstanceOf(CanvasError);
    await expect(identify()).rejects.not.toBeInstanceOf(
      CredentialRejectedError,
    );
  });
});
