import { randomBytes } from 'node:crypto';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Response } from 'supertest';
import {
  bearerOf,
  CredentialRejectedError,
  PollConnector,
  type Credential,
  type IdentifiesAccounts,
  type PollsPortal,
  type PortalUser,
} from '@app/plugin-sdk';
import { CredentialVault } from '../src/accounts/domain/credential-vault.js';
import type { PortalAccountState } from '../src/accounts/domain/portal-account.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { REDIS } from '../src/platform/redis/redis.module.js';
import { bootApp } from './app.js';
import { accounts } from './accounts.js';

// The token routes as the app wires them: the session's age, the named
// limit, the schema, the 422 and the 503, identity's admin query and its
// delete hook, and the token in no output and nowhere stored but sealed.
// Who may link what, and an account kept or made anew, are checked on fakes
// (PortalLinks, PortalAccounts).

// what each token makes the portal answer, and a part of it no output may hold
const mark = () => randomBytes(12).toString('hex');
const TOKENS = {
  good: `good~${mark()}`,
  // another portal user's
  other: `other~${mark()}`,
  refused: `refused~${mark()}`,
  away: `away~${mark()}`,
  // not one the schema takes
  bad: `bad token ${mark()}`,
};
const EXPIRES_AT = '2026-12-30T08:00:00.000Z';

// a portal the way a connector that links accounts is written
abstract class Linking implements PollsPortal, IdentifiesAccounts {
  async poll() {}

  async identify(credential: Credential): Promise<PortalUser> {
    const pasted = bearerOf(credential).reveal();
    if (pasted.startsWith('refused~')) throw new CredentialRejectedError();
    if (pasted.startsWith('away~')) throw new Error('the portal is away');
    const id = pasted.startsWith('other~') ? '5151' : '4242';
    return { id, expiresAt: new Date(EXPIRES_AT) };
  }
}

@PollConnector({ portal: 'linked', schedule: '0 0 1 1 *', links: ['token'] })
@Injectable()
class LinkedPortal extends Linking {}

@PollConnector({ portal: 'staff', schedule: '0 0 1 1 *', links: ['token'] })
@Injectable()
class StaffPortal extends Linking {}

@Module({ providers: [LinkedPortal, StaffPortal] })
class LinkingPluginsModule {}

describe('portal accounts', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signIn, signUp, userId, makeAdmin } = accounts(
    () => app,
    mails,
  );
  const tokenOf = (portal: string) => `/api/me/portals/${portal}/token`;
  const put = (cookie: string, portal: string, token: unknown) =>
    http().put(tokenOf(portal)).set('cookie', cookie).send({ token });
  const list = async (cookie: string) =>
    (await http().get('/api/me/portals').set('cookie', cookie).expect(200))
      .body as object[];

  // everything the app writes, and every answer it gives
  const output: string[] = [];
  const answers: string[] = [];
  const keep = (res: Response) => {
    answers.push(res.text, JSON.stringify(res.headers));
    return res;
  };

  beforeAll(async () => {
    for (const stream of [process.stdout, process.stderr])
      vi.spyOn(stream, 'write').mockImplementation((chunk) => {
        output.push(String(chunk));
        return true;
      });
    vi.stubEnv('PORTAL_LINKS', 'linked=token, staff=token/admins');
    vi.stubEnv(
      'PORTAL_CREDENTIALS_SECRETS',
      `1:${randomBytes(32).toString('base64')}`,
    );
    app = await bootApp({ mails, imports: [LinkingPluginsModule] });
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('links a token, lists it and unlinks it, account and credential together', async () => {
    const ana = await signUp('ana@portals.test');
    const prisma = app.get(PrismaService);

    keep(await put(ana, 'linked', TOKENS.good).expect(204));
    expect(await list(ana)).toEqual([
      {
        portal: 'linked',
        mode: 'token',
        linked: true,
        status: 'linked',
        expiresAt: EXPIRES_AT,
      },
    ]);
    const [account] = await prisma.portalAccount.findMany({
      where: { userId: await userId('ana@portals.test') },
      include: { credential: true },
    });
    expect(account).toMatchObject({ portalUser: '4242', mode: 'token' });
    expect(account.credential?.sealed).toMatch(/^1\./);

    keep(await http().delete(tokenOf('linked')).set('cookie', ana).expect(204));
    expect(await list(ana)).toEqual([
      expect.objectContaining({ portal: 'linked', linked: false }),
    ]);
    expect(await prisma.portalCredential.count()).toBe(0);
  });

  it("puts another portal user's account in the old one's place, its credential with it", async () => {
    const hu = await signUp('hu@portals.test');
    const prisma = app.get(PrismaService);
    const where = { userId: await userId('hu@portals.test') };
    await put(hu, 'linked', TOKENS.good).expect(204);
    const first = await prisma.portalAccount.findFirstOrThrow({ where });

    keep(await put(hu, 'linked', TOKENS.other).expect(204));
    const rows = await prisma.portalAccount.findMany({
      where,
      include: { credential: true },
    });
    expect(rows).toHaveLength(1);
    const [{ credential, ...row }] = rows;
    expect(row.id).not.toBe(first.id);
    expect(row.portalUser).toBe('5151');
    expect(credential?.accountId).toBe(row.id);
    // sealed for the row as it is now, holding the second token
    const opened = app
      .get(CredentialVault)
      .open(credential!.sealed, row as PortalAccountState);
    expect(opened.reveal()).toBe(TOKENS.other);
  });

  it("answers 422 for a token the portal doesn't take, 503 while it's away, 400 for one that's none", async () => {
    const bo = await signUp('bo@portals.test');

    const refused = keep(await put(bo, 'linked', TOKENS.refused).expect(422));
    expect(refused.body.message).toBe('the portal did not take the token');
    keep(await put(bo, 'linked', TOKENS.away).expect(503));
    keep(await put(bo, 'linked', TOKENS.bad).expect(400));
    keep(
      await http()
        .put(tokenOf('NotAPortal'))
        .set('cookie', bo)
        .send({ token: TOKENS.good })
        .expect(400),
    );
    expect((await list(bo))[0]).toMatchObject({ linked: false });
  });

  it('takes a token only from a session signed in within a day', async () => {
    const cy = await signUp('cy@portals.test');
    const day = 24 * 60 * 60 * 1000;
    await app.get(PrismaService).session.updateMany({
      where: { userId: await userId('cy@portals.test') },
      data: { createdAt: new Date(Date.now() - 2 * day) },
    });

    const stale = keep(await put(cy, 'linked', TOKENS.good).expect(403));
    expect(stale.body.code).toBe('SESSION_NOT_FRESH');
    // what outlasts no session needs none fresh
    await list(cy);
    await http().delete(tokenOf('linked')).set('cookie', cy).expect(204);
  });

  it('counts setting a token against a limit of its own, 10 a minute', async () => {
    const di = await signUp('di@portals.test');
    const res = keep(await put(di, 'linked', TOKENS.good).expect(204));

    expect(res.headers['x-ratelimit-limit-link']).toBe('10');
    expect(res.headers).not.toHaveProperty('x-ratelimit-limit-api');
  });

  it('lets only admins link a portal for admins, asking identity', async () => {
    const ed = await signUp('ed@portals.test');
    keep(await put(ed, 'staff', TOKENS.good).expect(404));
    expect(
      (await list(ed)).map((p) => (p as { portal: string }).portal),
    ).toEqual(['linked']);

    await makeAdmin('ed@portals.test');
    keep(await put(ed, 'staff', TOKENS.good).expect(204));
  });

  it("takes a deleted user's accounts away with them", async () => {
    const fy = await signUp('fy@portals.test');
    await put(fy, 'linked', TOKENS.good).expect(204);
    const id = await userId('fy@portals.test');
    await signUp('gu@portals.test');
    await makeAdmin('gu@portals.test');
    const admin = await signIn('gu@portals.test', 'correct horse 1');

    await post('/admin/remove-user', { userId: id }, admin).expect(200);
    const prisma = app.get(PrismaService);
    await vi.waitFor(async () =>
      expect(await prisma.portalAccount.count({ where: { userId: id } })).toBe(
        0,
      ),
    );
  });

  // last: after every way a token went in above
  it('shows a token sent in nowhere: no log, no answer, nothing stored but sealed', async () => {
    const marks = Object.values(TOKENS).map((t) => t.split(/[~ ]/).at(-1)!);
    const prisma = app.get(PrismaService);
    const tables = await prisma.$queryRaw<{ s: string; t: string }[]>`
      SELECT table_schema AS s, table_name AS t FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')`;
    const stored: string[] = [];
    for (const { s, t } of tables)
      stored.push(
        JSON.stringify(
          await prisma.$queryRawUnsafe(
            `SELECT row_to_json(r)::text AS line FROM "${s}"."${t}" r`,
          ),
        ),
      );
    const redis = app.get<Redis>(REDIS);
    for (const key of await redis.keys('*')) {
      const reads: Record<string, () => Promise<unknown>> = {
        string: () => redis.get(key),
        hash: () => redis.hgetall(key),
        list: () => redis.lrange(key, 0, -1),
        set: () => redis.smembers(key),
        zset: () => redis.zrange(key, '0', '-1'),
        stream: () => redis.xrange(key, '-', '+'),
      };
      stored.push(JSON.stringify(await reads[await redis.type(key)]?.()));
    }

    // the capture works: the 503 was logged
    expect(output.join('')).toContain('could not be asked whose the token is');
    for (const [what, text] of Object.entries({
      output: output.join(''),
      answers: answers.join(''),
      stored: stored.join(''),
    }))
      for (const part of marks) expect(text, what).not.toContain(part);
  });
});
