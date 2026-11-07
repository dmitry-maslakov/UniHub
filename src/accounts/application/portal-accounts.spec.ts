import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CredentialRejectedError,
  type Credential,
  type PortalUser,
} from '@app/plugin-sdk';
import { PortalId, Secret } from '@app/kernel';
import { IsAdminQuery } from '../../identity/contracts.js';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import { FakeBus } from '../../../test/fake-bus.js';
import { NotLinkableError, UnsupportedLinkError } from '../domain/errors.js';
import { PortalLinks, type PortalLink } from '../domain/portal-links.js';
import { AccountsChangedCommand } from '../../plugins/contracts.js';
import {
  catalogBus,
  FakeVault,
  InMemoryAccounts,
  InMemoryPicks,
  InMemoryWanted,
  noTransactions,
} from './accounts.fakes.js';
import { PortalUnavailableError, TokenRefusedError } from './errors.js';
import { PortalAccounts } from './portal-accounts.js';
import { PortalPicks } from './portal-picks.js';

const TOKEN = '1~ana-pasted-token';
const portal = (id: string) => PortalId.parse(id);
const [CANVAS, MOODLE, TEAMS, CATALOG] = [
  'canvas',
  'moodle',
  'teams',
  'catalog',
].map(portal);

// canvas for admins, moodle for everyone, teams shared, catalog public and
// served over gRPC; bo is an admin
const LINKS: Record<string, PortalLink> = {
  canvas: { mode: 'token', adminsOnly: true },
  moodle: { mode: 'token', adminsOnly: false },
};
const PUBLIC: PortalLink = { mode: 'public', adminsOnly: false };
const course = (externalId: string) => ({
  id: `pc-${externalId}`,
  externalId,
  name: externalId,
  url: null,
  since: new Date('2026-01-01T00:00:00Z'),
});

type Identify = (credential: Credential) => Promise<PortalUser>;

function accounts({
  identify = async () => ({ id: '4242', expiresAt: null }) as PortalUser,
  links = LINKS,
}: { identify?: Identify; links?: Record<string, PortalLink> } = {}) {
  const asked: Credential[] = [];
  const connector = {
    poll: async () => {},
    identify: async (credential: Credential) => {
      asked.push(credential);
      return identify(credential);
    },
  };
  const plugins = catalogOf(
    {
      polls: [
        poll('canvas', connector, ['token']),
        poll('moodle', connector, ['token']),
        poll('teams'),
      ],
    },
    ['catalog'],
  );
  const queries = new FakeBus([
    [IsAdminQuery, ({ userId }: IsAdminQuery) => userId === 'bo'],
  ]);
  const commands = new FakeBus();
  const store = new InMemoryAccounts();
  const vault = new FakeVault();
  const policy = new PortalLinks(
    new Map(Object.entries(links).map(([id, link]) => [portal(id), link])),
    new Map([[CANVAS, 'Canvas']]),
  );
  const picks = new InMemoryPicks();
  const service = new PortalAccounts(
    policy,
    store,
    vault,
    plugins,
    new PortalPicks(
      policy,
      picks,
      new InMemoryWanted(),
      catalogBus({ catalog: [course('os'), course('net')] }).queries,
    ),
    queries.queries,
    commands.commands,
  );
  service.onApplicationBootstrap();
  const setToken = (userId: string, p: PortalId, token = TOKEN) =>
    service.setToken(userId, p, new Secret(token));
  return {
    service,
    store,
    vault,
    picks,
    asked,
    setToken,
    told: commands.sent,
  };
}

describe('PortalAccounts', () => {
  // for PortalPicks' @Transactional()
  beforeAll(async () => {
    await Test.createTestingModule({ imports: [noTransactions()] }).compile();
  });

  it('links a token as whoever the portal says it is, sealed for the account', async () => {
    const until = new Date('2026-12-30T08:00:00Z');
    const { store, vault, asked, setToken } = accounts({
      identify: async () => ({ id: '4242', expiresAt: until }),
    });
    await setToken('ana', MOODLE);

    expect(asked.map((c) => [c.kind, c.token.reveal()])).toEqual([
      ['token', TOKEN],
    ]);
    const [{ account, sealed }] = store.rows.values();
    expect(account).toMatchObject({
      userId: 'ana',
      portal: MOODLE,
      mode: 'token',
      portalUser: '4242',
      status: 'linked',
      expiresAt: until,
    });
    expect(vault.open(sealed, account).reveal()).toBe(TOKEN);
  });

  it("keeps the account for the same portal user's token, not for another's", async () => {
    let id = '4242';
    const { store, setToken, told } = accounts({
      identify: async () => ({ id, expiresAt: null }),
    });
    const accountId = async () =>
      (await store.find('ana', MOODLE))!.snapshot.id;

    await setToken('ana', MOODLE);
    const first = await accountId();
    await setToken('ana', MOODLE, '1~a-new-one');
    expect(await accountId()).toBe(first);

    id = '5151';
    await setToken('ana', MOODLE, '1~someone-elses');
    const second = await accountId();
    expect(second).not.toBe(first);
    expect(store.rows.size).toBe(1);

    // plugins run the account linked, and forget the one it replaced
    expect(told).toEqual([
      new AccountsChangedCommand(MOODLE, { linked: [first], gone: [] }),
      new AccountsChangedCommand(MOODLE, { linked: [first], gone: [] }),
      new AccountsChangedCommand(MOODLE, { linked: [second], gone: [first] }),
    ]);
  });

  it('takes a token only where the portal links by token, for admins from admins alone', async () => {
    const { store, asked, setToken } = accounts();

    for (const [userId, p] of [
      ['ana', CANVAS],
      ['bo', TEAMS],
      ['bo', portal('elsewhere')],
    ] as const)
      await expect(setToken(userId, p)).rejects.toThrow(
        new NotLinkableError(p, 'token'),
      );
    expect(asked).toEqual([]);

    await setToken('bo', CANVAS);
    expect([...store.rows.keys()]).toEqual(['bo:canvas']);
  });

  it("refuses a token the portal doesn't take, naming nothing, and keeps what was linked", async () => {
    let rejects = false;
    const { store, setToken } = accounts({
      identify: async () => {
        if (rejects) throw new CredentialRejectedError();
        return { id: '4242', expiresAt: null };
      },
    });
    await setToken('ana', MOODLE);
    const before = [...store.rows.values()];

    rejects = true;
    const refused = await setToken('ana', MOODLE, '1~revoked-one').catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(TokenRefusedError);
    expect(inspect(refused)).not.toContain('revoked-one');
    expect([...store.rows.values()]).toEqual(before);
  });

  it('answers try again later when the portal can say nothing, and keeps nothing', async () => {
    const away = new Error('canvas did not answer');
    const failing = accounts({
      identify: async () => {
        throw away;
      },
    });
    await expect(failing.setToken('ana', MOODLE)).rejects.toThrow(
      new PortalUnavailableError(MOODLE, 'Error'),
    );

    // an answer the hub can't keep is the connector failing
    for (const answer of [
      { id: '', expiresAt: null },
      { id: 'ana@uni.test'.repeat(30), expiresAt: null },
      { id: '4242', expiresAt: new Date('never') },
    ]) {
      const odd = accounts({ identify: async () => answer });
      const error = (await odd
        .setToken('ana', MOODLE)
        .catch((e: unknown) => e)) as Error;
      expect(error).toBeInstanceOf(PortalUnavailableError);
      expect(error.cause).toBeUndefined();
      expect(odd.store.rows.size).toBe(0);
    }
    expect(failing.store.rows.size).toBe(0);
  });

  it("keeps nothing of a plugin's error but its name, whatever of the token it holds", async () => {
    const prefix = TOKEN.slice(0, 5);
    // as an axios error would come, and a careless message
    const leaky = Object.assign(
      new Error(`GET /api/v1/users/self/tokens/${prefix} failed: ${TOKEN}`),
      {
        name: 'AxiosError',
        config: { headers: { Authorization: `Bearer ${TOKEN}` } },
      },
    );
    const named = Object.assign(new Error('x'), { name: TOKEN });
    for (const [thrown, failure] of [
      [leaky, 'AxiosError'],
      [named, 'Error'],
      [TOKEN, 'string'],
    ] as const) {
      const { setToken } = accounts({
        identify: async () => {
          throw thrown;
        },
      });
      const error = (await setToken('ana', MOODLE).catch(
        (e: unknown) => e,
      )) as PortalUnavailableError;
      expect(error).toMatchObject({ portal: MOODLE, failure });
      expect(error.cause).toBeUndefined();

      // as the global filter logs an unavailable one
      const written: string[] = [];
      const write = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(write);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(write);
      try {
        new Logger('DomainErrorFilter').error(error);
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      for (const shown of [
        written.join(''),
        inspect(error, { depth: Infinity, showHidden: true }),
        JSON.stringify(error),
      ])
        expect(shown).not.toContain(prefix);
      expect(written.join('')).toContain(failure);
    }
  });

  it('lists the portals open to the user and their own links, nothing of anyone else', async () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const { service, store, setToken } = accounts({
      identify: async () => ({ id: '4242', expiresAt: past }),
    });
    await setToken('bo', CANVAS);
    await setToken('bo', MOODLE);

    expect(await service.list('ana')).toEqual([
      {
        portal: MOODLE,
        label: 'moodle',
        mode: 'token',
        linked: false,
        status: null,
        expiresAt: null,
        picked: null,
      },
    ]);
    expect(await service.list('bo')).toEqual(
      [CANVAS, MOODLE].map((p) => ({
        portal: p,
        label: p === CANVAS ? 'Canvas' : p,
        mode: 'token',
        linked: true,
        status: 'expired',
        expiresAt: past,
        picked: null,
      })),
    );

    // linked when its portal was open, shared since: theirs to see and unlink
    const moodle = store.rows.get('bo:moodle')!;
    store.rows.set('bo:teams', {
      ...moodle,
      account: { ...moodle.account, portal: TEAMS },
    });
    expect((await service.list('bo')).at(-1)).toMatchObject({
      portal: TEAMS,
      mode: 'shared',
      linked: true,
    });
  });

  it('lists a public portal with how many of its courses the user picked, never as linked', async () => {
    const { service, store, picks, setToken } = accounts({
      links: { ...LINKS, catalog: PUBLIC },
    });
    picks.rows.push(
      { userId: 'ana', portalCourseId: 'pc-os' },
      { userId: 'bo', portalCourseId: 'pc-net' },
      // no longer in its catalog
      { userId: 'ana', portalCourseId: 'pc-gone' },
    );
    // an account of it left of when it was linked by token
    await setToken('ana', MOODLE);
    const moodle = store.rows.get('ana:moodle')!;
    store.rows.set('ana:catalog', {
      ...moodle,
      account: { ...moodle.account, portal: CATALOG },
    });

    expect((await service.list('ana'))[0]).toEqual({
      portal: CATALOG,
      label: 'catalog',
      mode: 'public',
      linked: false,
      status: null,
      expiresAt: null,
      picked: 1,
    });
    expect((await service.list('cy'))[0]).toMatchObject({
      portal: CATALOG,
      picked: 0,
    });
  });

  it("reads through the user's own accounts that read now, in the portals not shared", async () => {
    const until = new Date('2026-12-30T08:00:00Z');
    const { service, store, setToken } = accounts({
      identify: async () => ({ id: '4242', expiresAt: until }),
    });
    await setToken('ana', MOODLE);
    await setToken('bo', CANVAS);
    const moodle = store.rows.get('ana:moodle')!;
    const before = new Date('2026-12-01T00:00:00Z');

    expect(await service.viewing('ana', before)).toEqual({
      portals: [CANVAS, MOODLE],
      accounts: [moodle.account.id],
      picks: { portals: [], courses: [], into: new Map() },
    });
    // nobody else's, nor one past its expiry
    expect((await service.viewing('cy', before)).accounts).toEqual([]);
    expect((await service.viewing('ana', until)).accounts).toEqual([]);
    // revoked, or of a portal read as shared since
    store.rows.set('ana:moodle', {
      ...moodle,
      account: { ...moodle.account, status: 'revoked' },
    });
    store.rows.set('ana:teams', {
      ...moodle,
      account: { ...moodle.account, id: 'teams-account', portal: TEAMS },
    });
    expect((await service.viewing('ana', before)).accounts).toEqual([]);

    // with every portal read as shared, no account is looked up
    const shared = accounts({ links: {} });
    const ofUser = vi.spyOn(shared.store, 'ofUser');
    expect(await shared.service.viewing('ana')).toEqual({
      portals: [],
      accounts: [],
      picks: { portals: [], courses: [], into: new Map() },
    });
    expect(ofUser).not.toHaveBeenCalled();
  });

  it("reads a public portal by the user's picks alone, asking for no account", async () => {
    const { service, store, picks } = accounts({ links: { catalog: PUBLIC } });
    picks.rows.push({ userId: 'ana', portalCourseId: 'pc-os', into: 'pc-c1' });
    const ofUser = vi.spyOn(store, 'ofUser');

    expect(await service.viewing('ana')).toEqual({
      portals: [],
      accounts: [],
      picks: {
        portals: [CATALOG],
        courses: ['pc-os'],
        into: new Map([['pc-os', 'pc-c1']]),
      },
    });
    expect(ofUser).not.toHaveBeenCalled();
  });

  it('unlinks the account and its credential, whatever the mode is now, and plugins forget it', async () => {
    const { service, store, setToken, told } = accounts();
    await setToken('ana', MOODLE);
    const { id } = store.rows.get('ana:moodle')!.account;
    told.length = 0;
    await service.unlink('ana', MOODLE);
    await service.unlink('ana', TEAMS);

    expect(store.rows.size).toBe(0);
    expect(told).toEqual([new AccountsChangedCommand(MOODLE, { gone: [id] })]);
  });

  it("removes a deleted user's accounts and picks, nobody else's, and plugins forget each account", async () => {
    const { service, store, picks, setToken, told } = accounts();
    await setToken('ana', MOODLE);
    await setToken('bo', CANVAS);
    picks.rows.push(
      { userId: 'ana', portalCourseId: 'pc-os' },
      { userId: 'bo', portalCourseId: 'pc-net' },
    );
    const { id } = store.rows.get('ana:moodle')!.account;
    told.length = 0;
    await service.removeAllOf('ana');

    expect([...store.rows.keys()]).toEqual(['bo:canvas']);
    expect(picks.rows).toEqual([{ userId: 'bo', portalCourseId: 'pc-net' }]);
    expect(told).toEqual([new AccountsChangedCommand(MOODLE, { gone: [id] })]);
  });

  it('runs a portal not shared for its accounts that read now, each with its own credential opened', async () => {
    const until = new Date('2026-12-30T08:00:00Z');
    const { service, store, setToken } = accounts({
      identify: async () => ({ id: '4242', expiresAt: until }),
    });
    await setToken('ana', MOODLE);
    await setToken('bo', MOODLE, '1~bo-pasted-token');
    const id = (user: string) => store.rows.get(`${user}:moodle`)!.account.id;
    const before = new Date('2026-12-01T00:00:00Z');

    expect(await service.readers(TEAMS)).toEqual({ shared: true });
    // a public one by its one account too
    expect(
      await accounts({ links: { catalog: PUBLIC } }).service.readers(CATALOG),
    ).toEqual({ shared: true });
    expect(await service.readers(MOODLE, before)).toEqual({
      shared: false,
      accounts: [id('ana'), id('bo')],
    });
    const bo = await service.credential(id('bo'), before);
    expect(bo?.credential).toEqual({
      kind: 'token',
      token: expect.any(Secret),
    });
    if (bo?.credential.kind === 'token')
      expect(bo.credential.token.reveal()).toBe('1~bo-pasted-token');
    // past its expiry, or one the portal rejected since: none
    expect(await service.readers(MOODLE, until)).toEqual({
      shared: false,
      accounts: [],
    });
    const ana = await service.credential(id('ana'), before);
    expect(await service.credential(id('ana'), until)).toBeNull();
    await service.rejected(id('ana'), ana!.seal);
    expect(store.rows.get('ana:moodle')!.account.status).toBe('revoked');
    expect(await service.credential(id('ana'), before)).toBeNull();
    expect(await service.readers(MOODLE, before)).toEqual({
      shared: false,
      accounts: [id('bo')],
    });
    expect(await service.credential('nobody')).toBeNull();
  });

  it('revokes the credential a run had, not one the account was linked by again since', async () => {
    const { service, store, setToken } = accounts();
    await setToken('ana', MOODLE, '1~old');
    const { id } = store.rows.get('ana:moodle')!.account;
    const old = await service.credential(id);
    // linked again by the same portal user while a run on the old one goes
    await setToken('ana', MOODLE, '1~new');
    expect(store.rows.get('ana:moodle')!.account.id).toBe(id);

    await service.rejected(id, old!.seal);
    expect(store.rows.get('ana:moodle')!.account.status).toBe('linked');
    const fresh = await service.credential(id);
    expect(fresh?.seal).not.toBe(old!.seal);
    await service.rejected(id, fresh!.seal);
    expect(store.rows.get('ana:moodle')!.account.status).toBe('revoked');
  });

  it("opens no credential of an account of a portal that's read as shared since", async () => {
    const { store, setToken } = accounts();
    await setToken('ana', MOODLE);
    const { id } = store.rows.get('ana:moodle')!.account;
    const shared = accounts({ links: {} }).service;
    Object.assign(shared, { accounts: store });

    expect(await shared.credential(id)).toBeNull();
  });

  it('stops at startup on a mode no connector here takes', () => {
    for (const p of ['teams', 'elsewhere'])
      expect(() =>
        accounts({ links: { [p]: { mode: 'token', adminsOnly: false } } }),
      ).toThrow(new UnsupportedLinkError(portal(p), 'token'));
    expect(() => accounts({ links: {} })).not.toThrow();
  });

  it('takes public for a portal served over gRPC alone', () => {
    expect(() => accounts({ links: { catalog: PUBLIC } })).not.toThrow();
    for (const p of ['moodle', 'elsewhere'])
      expect(() => accounts({ links: { [p]: PUBLIC } })).toThrow(
        new UnsupportedLinkError(portal(p), 'public'),
      );
  });
});
