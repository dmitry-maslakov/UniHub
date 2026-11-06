import { inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import {
  bearerOf,
  CredentialRejectedError,
  type Credential,
  type PortalUser,
} from '@app/plugin-sdk';
import { PortalId, Secret } from '@app/kernel';
import { IsAdminQuery } from '../../identity/contracts.js';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import { FakeBus } from '../../../test/fake-bus.js';
import { NotLinkableError, UnsupportedLinkError } from '../domain/errors.js';
import { grantOf, RENEW_BEFORE_MS } from '../domain/oauth-grant.js';
import { PortalLinks, type PortalLink } from '../domain/portal-links.js';
import { AccountsChangedCommand } from '../../plugins/contracts.js';
import { accountsSettings } from '../accounts.config.js';
import {
  FakeOAuthClient,
  FakeVault,
  InMemoryAccounts,
  InMemoryConsents,
} from './accounts.fakes.js';
import { Credentials } from './credentials.js';
import { OAuthLinking } from './oauth-linking.js';
import {
  ConsentUnknownError,
  OAuthRefusedError,
  PortalUnavailableError,
  TokenRefusedError,
} from './errors.js';
import { PortalAccounts } from './portal-accounts.js';

const TOKEN = '1~ana-pasted-token';
const portal = (id: string) => PortalId.parse(id);
const [CANVAS, MOODLE, TEAMS, LMS] = ['canvas', 'moodle', 'teams', 'lms'].map(
  portal,
);

// canvas for admins, moodle for everyone, teams shared, lms by its consent
// page; bo is an admin
const TOKEN_LINKS: Record<string, PortalLink> = {
  canvas: { mode: 'token', adminsOnly: true },
  moodle: { mode: 'token', adminsOnly: false },
};
const LINKS: Record<string, PortalLink> = {
  ...TOKEN_LINKS,
  lms: { mode: 'oauth', adminsOnly: false },
};
export const LMS_SERVER = {
  issuer: 'https://lms.example.test',
  authorizationEndpoint: 'https://lms.example.test/authorize',
  tokenEndpoint: 'https://lms.example.test/token',
  clientId: 'hub',
  clientSecret: new Secret('hub-secret'),
};

type Identify = (credential: Credential) => Promise<PortalUser>;

function accounts({
  identify = async () => ({ id: '4242', expiresAt: null }) as PortalUser,
  links = LINKS,
}: { identify?: Identify; links?: Record<string, PortalLink> } = {}) {
  const asked: Credential[] = [];
  const revoked: string[] = [];
  let revokes: () => Promise<void> = async () => {};
  const connector = {
    poll: async () => {},
    identify: async (credential: Credential) => {
      asked.push(credential);
      return identify(credential);
    },
    oauthServer: () => LMS_SERVER,
    revoke: async (credential: Credential) => {
      await revokes();
      revoked.push(bearerOf(credential).reveal());
    },
  };
  const plugins = catalogOf({
    polls: [
      poll('canvas', connector, ['token']),
      poll('moodle', connector, ['token']),
      poll('teams'),
      poll('lms', connector, ['oauth']),
    ],
  });
  const queries = new FakeBus([
    [IsAdminQuery, ({ userId }: IsAdminQuery) => userId === 'bo'],
  ]);
  const commands = new FakeBus();
  const store = new InMemoryAccounts();
  const vault = new FakeVault();
  const client = new FakeOAuthClient();
  const consents = new InMemoryConsents();
  const credentials = new Credentials(vault, store, plugins, client);
  const policy = new PortalLinks(
    new Map(Object.entries(links).map(([id, link]) => [portal(id), link])),
  );
  const service = new PortalAccounts(
    policy,
    store,
    credentials,
    plugins,
    queries.queries,
    commands.commands,
  );
  service.onApplicationBootstrap();
  const config = accountsSettings.parse({
    BETTER_AUTH_URL: 'https://hub.example.test',
  });
  const oauth = new OAuthLinking(
    service,
    credentials,
    client,
    consents,
    config,
  );
  const setToken = (userId: string, p: PortalId, token = TOKEN) =>
    service.setToken(userId, p, new Secret(token));
  // a user through the consent page: sent there, back with the code
  const consent = async (userId: string, code = '1', p = LMS) => {
    const state = (await oauth.start(userId, p)).searchParams.get('state')!;
    await oauth.finish(userId, p, new URLSearchParams({ code, state }));
  };
  return {
    service,
    store,
    vault,
    asked,
    setToken,
    told: commands.sent,
    oauth,
    client,
    consents,
    consent,
    revoked,
    revoking: (failing: () => Promise<void>) => (revokes = failing),
  };
}

describe('PortalAccounts', () => {
  it('links a token as whoever the portal says it is, sealed for the account', async () => {
    const until = new Date('2026-12-30T08:00:00Z');
    const { store, vault, asked, setToken } = accounts({
      identify: async () => ({ id: '4242', expiresAt: until }),
    });
    await setToken('ana', MOODLE);

    expect(asked.map((c) => [c.kind, bearerOf(c).reveal()])).toEqual([
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
      links: TOKEN_LINKS,
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
      links: TOKEN_LINKS,
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

  it("removes a deleted user's accounts, nobody else's, and plugins forget each", async () => {
    const { service, store, setToken, told } = accounts();
    await setToken('ana', MOODLE);
    await setToken('bo', CANVAS);
    const { id } = store.rows.get('ana:moodle')!.account;
    told.length = 0;
    await service.removeAllOf('ana');

    expect([...store.rows.keys()]).toEqual(['bo:canvas']);
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
    expect(await service.readers(MOODLE, before)).toEqual({
      shared: false,
      accounts: [id('ana'), id('bo')],
    });
    expect(
      bearerOf((await service.credential(id('bo'), before))!).reveal(),
    ).toBe('1~bo-pasted-token');
    // past its expiry, or one the portal rejected since: none
    expect(await service.readers(MOODLE, until)).toEqual({
      shared: false,
      accounts: [],
    });
    expect(await service.credential(id('ana'), until)).toBeNull();
    await service.rejected(id('ana'));
    expect(store.rows.get('ana:moodle')!.account.status).toBe('revoked');
    expect(await service.credential(id('ana'), before)).toBeNull();
    expect(await service.readers(MOODLE, before)).toEqual({
      shared: false,
      accounts: [id('bo')],
    });
    expect(await service.credential('nobody')).toBeNull();
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
});

describe("PortalAccounts, by the portal's consent page", () => {
  const grantOfRow = (
    store: InMemoryAccounts,
    vault: FakeVault,
    key: string,
  ) => {
    const { account, sealed } = store.rows.get(key)!;
    return grantOf(vault.open(sealed, account));
  };

  it('sends the user to the consent page and links the account by the tokens its code gives, sealed as one grant', async () => {
    const { oauth, store, vault, asked, client, told } = accounts();
    const url = await oauth.start('ana', LMS);

    expect(url.origin + url.pathname).toBe(
      'https://lms.example.test/authorize',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://hub.example.test/api/me/portals/lms/oauth/callback',
    );
    const state = url.searchParams.get('state')!;
    await oauth.finish('ana', LMS, new URLSearchParams({ code: '7', state }));

    expect(client.exchanged.map((e) => e.verifier)).toEqual(['verifier-1']);
    expect(asked.map((c) => [c.kind, bearerOf(c).reveal()])).toEqual([
      ['oauth', 'access-7'],
    ]);
    expect(store.rows.get('ana:lms')!.account).toMatchObject({
      mode: 'oauth',
      portalUser: '4242',
      status: 'linked',
    });
    const grant = grantOfRow(store, vault, 'ana:lms');
    expect([grant.accessToken.reveal(), grant.refreshToken?.reveal()]).toEqual([
      'access-7',
      'refresh-7',
    ]);
    expect(told).toEqual([
      new AccountsChangedCommand(LMS, {
        linked: [store.rows.get('ana:lms')!.account.id],
        gone: [],
      }),
    ]);
  });

  it("takes a consent's state once, and only from the user and the portal it was asked for", async () => {
    const { oauth, store } = accounts();
    const state = (await oauth.start('ana', LMS)).searchParams.get('state')!;
    const answer = new URLSearchParams({ code: '1', state });

    await expect(oauth.finish('bo', LMS, answer)).rejects.toThrow(
      ConsentUnknownError,
    );
    // taken by bo's try: ana starts again
    await expect(oauth.finish('ana', LMS, answer)).rejects.toThrow(
      ConsentUnknownError,
    );
    const again = (await oauth.start('ana', LMS)).searchParams.get('state')!;
    await expect(
      oauth.finish(
        'ana',
        MOODLE,
        new URLSearchParams({ code: '1', state: again }),
      ),
    ).rejects.toThrow(ConsentUnknownError);
    await expect(
      oauth.finish('ana', LMS, new URLSearchParams({ code: '1' })),
    ).rejects.toThrow(ConsentUnknownError);
    expect(store.rows.size).toBe(0);
  });

  it('links nothing when the portal says no, and answers try again later when it is away', async () => {
    const { oauth, client, store } = accounts();
    client.refuses.add('code');
    const first = (await oauth.start('ana', LMS)).searchParams.get('state')!;
    await expect(
      oauth.finish(
        'ana',
        LMS,
        new URLSearchParams({ code: '1', state: first }),
      ),
    ).rejects.toThrow(OAuthRefusedError);

    client.refuses.clear();
    client.away = true;
    const second = (await oauth.start('ana', LMS)).searchParams.get('state')!;
    const away = await oauth
      .finish('ana', LMS, new URLSearchParams({ code: '1', state: second }))
      .catch((e: unknown) => e);
    expect(away).toBeInstanceOf(PortalUnavailableError);
    expect(away).toMatchObject({ failure: 'Error' });
    expect(store.rows.size).toBe(0);
  });

  it('starts no consent of a portal not linked by OAuth, nor for admins alone to anyone else', async () => {
    const { oauth } = accounts({
      links: { ...LINKS, lms: { mode: 'oauth', adminsOnly: true } },
    });
    for (const [userId, p] of [
      ['ana', LMS],
      ['bo', MOODLE],
    ] as const)
      await expect(oauth.start(userId, p)).rejects.toThrow(
        new NotLinkableError(p, 'oauth'),
      );
    await expect(oauth.start('bo', LMS)).resolves.toBeInstanceOf(URL);
  });

  it('renews the access token before it runs out, keeping the refresh token, and revokes the account once the portal refuses', async () => {
    const { service, consent, store, vault, client } = accounts();
    await consent('ana');
    const { id } = store.rows.get('ana:lms')!.account;
    const soon = new Date(Date.now() + 60 * 60_000 - RENEW_BEFORE_MS + 1);

    expect(bearerOf((await service.credential(id))!).reveal()).toBe('access-1');
    expect(bearerOf((await service.credential(id, soon))!).reveal()).toBe(
      'access-1.1',
    );
    expect(grantOfRow(store, vault, 'ana:lms').refreshToken?.reveal()).toBe(
      'refresh-1',
    );

    client.refuses.add('refresh');
    expect(
      await service.credential(id, new Date(Date.now() + 2 * 60 * 60_000)),
    ).toBeNull();
    expect(store.rows.get('ana:lms')!.account.status).toBe('revoked');
  });

  it('takes an access token a run found refused for one run out when it renews, and revokes the account when it does not', async () => {
    const { service, consent, store, client } = accounts();
    await consent('ana');
    const { id } = store.rows.get('ana:lms')!.account;

    await service.rejected(id);
    expect(client.renewals).toBe(1);
    expect(store.rows.get('ana:lms')!.account.status).toBe('linked');

    client.refuses.add('refresh');
    await service.rejected(id);
    expect(store.rows.get('ana:lms')!.account.status).toBe('revoked');
  });

  it('takes the consent back at the portal on unlink and when another replaces it, and unlinks even when the portal fails to', async () => {
    const error = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { service, consent, revoked, revoking, store } = accounts();
    await consent('ana', '1');
    await consent('ana', '2');
    expect(revoked).toEqual(['access-1']);

    revoking(async () => {
      throw new Error('portal away with access-2 in its message');
    });
    await service.unlink('ana', LMS);
    expect(store.rows.size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      'an account of lms was not revoked there: Error',
    );
    error.mockRestore();
  });

  it("takes a deleted user's consents back at the portal", async () => {
    const { service, consent, setToken, revoked } = accounts();
    await consent('ana', '3');
    await setToken('ana', MOODLE);
    await service.removeAllOf('ana');
    expect(revoked).toEqual(['access-3']);
  });
});
