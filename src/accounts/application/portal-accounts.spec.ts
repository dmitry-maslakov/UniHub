import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
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
import { FakeVault, InMemoryAccounts } from './accounts.fakes.js';
import { PortalUnavailableError, TokenRefusedError } from './errors.js';
import { PortalAccounts } from './portal-accounts.js';

const TOKEN = '1~ana-pasted-token';
const portal = (id: string) => PortalId.parse(id);
const [CANVAS, MOODLE, TEAMS] = ['canvas', 'moodle', 'teams'].map(portal);

// canvas for admins, moodle for everyone, teams shared; bo is an admin
const LINKS: Record<string, PortalLink> = {
  canvas: { mode: 'token', adminsOnly: true },
  moodle: { mode: 'token', adminsOnly: false },
};

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
  const plugins = catalogOf({
    polls: [
      poll('canvas', connector, ['token']),
      poll('moodle', connector, ['token']),
      poll('teams'),
    ],
  });
  const queries = new FakeBus([
    [IsAdminQuery, ({ userId }: IsAdminQuery) => userId === 'bo'],
  ]);
  const store = new InMemoryAccounts();
  const vault = new FakeVault();
  const policy = new PortalLinks(
    new Map(Object.entries(links).map(([id, link]) => [portal(id), link])),
  );
  const service = new PortalAccounts(
    policy,
    store,
    vault,
    plugins,
    queries.queries,
  );
  service.onApplicationBootstrap();
  const setToken = (userId: string, p: PortalId, token = TOKEN) =>
    service.setToken(userId, p, new Secret(token));
  return { service, store, vault, asked, setToken };
}

describe('PortalAccounts', () => {
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
    const { store, setToken } = accounts({
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
    expect(await accountId()).not.toBe(first);
    expect(store.rows.size).toBe(1);
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
        mode: 'token',
        linked: false,
        status: null,
        expiresAt: null,
      },
    ]);
    expect(await service.list('bo')).toEqual(
      [CANVAS, MOODLE].map((p) => ({
        portal: p,
        mode: 'token',
        linked: true,
        status: 'expired',
        expiresAt: past,
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
    });
    expect(ofUser).not.toHaveBeenCalled();
  });

  it('unlinks the account and its credential, whatever the mode is now', async () => {
    const { service, store, setToken } = accounts();
    await setToken('ana', MOODLE);
    await service.unlink('ana', MOODLE);
    await service.unlink('ana', TEAMS);

    expect(store.rows.size).toBe(0);
  });

  it('stops at startup on a mode no connector here takes', () => {
    for (const p of ['teams', 'elsewhere'])
      expect(() =>
        accounts({ links: { [p]: { mode: 'token', adminsOnly: false } } }),
      ).toThrow(new UnsupportedLinkError(portal(p), 'token'));
    expect(() => accounts({ links: {} })).not.toThrow();
  });
});
