import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { http as handle, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  bearerOf,
  PollConnector,
  Secret,
  type Credential,
  type IdentifiesAccounts,
  type LinksByOAuth,
  type PollsPortal,
  type PortalUser,
} from '@app/plugin-sdk';
import { AccountCredentialQuery } from '../src/plugins/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';

// Linking by a portal's consent page as the app wires it: the route that
// sends the user there with a state and a PKCE challenge, the callback that
// trades the code with openid-client for tokens (a made-up portal, msw's),
// the state in Redis taken once, the grant sealed and renewed, and taken
// back at the portal on unlink. The rules are checked on fakes
// (portal-accounts.spec.ts), the client against msw
// (openid-oauth.client.spec.ts).

const PORTAL = 'consent';
const SERVER = 'https://consent.example.test';
const revoked: string[] = [];

// whose a token is: by its name, before -
@PollConnector({ portal: PORTAL, schedule: '0 0 1 1 *', links: ['oauth'] })
@Injectable()
class ConsentPortal implements PollsPortal, IdentifiesAccounts, LinksByOAuth {
  async poll() {}

  async identify(credential: Credential): Promise<PortalUser> {
    return { id: bearerOf(credential).reveal().split('-')[0], expiresAt: null };
  }

  oauthServer() {
    return {
      issuer: SERVER,
      authorizationEndpoint: `${SERVER}/authorize`,
      tokenEndpoint: `${SERVER}/token`,
      clientId: 'hub',
      clientSecret: new Secret('hub-secret'),
    };
  }

  async revoke(credential: Credential) {
    revoked.push(bearerOf(credential).reveal());
  }
}

@Module({ providers: [ConsentPortal] })
class ConsentModule {}

describe('linking by a consent page', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, userId } = accounts(() => app, mails);
  // the challenge each consent was asked with, by its state
  const challenges = new Map<string, string>();
  const portal = setupServer(
    handle.post(`${SERVER}/token`, async ({ request }) => {
      const body = new URLSearchParams(await request.text());
      if (body.get('grant_type') === 'refresh_token')
        return HttpResponse.json({
          access_token: 'ana-renewed',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      // the verifier is the one the consent's challenge was made of
      const challenge = createHash('sha256')
        .update(body.get('code_verifier') ?? '')
        .digest('base64url');
      if (
        body.get('client_secret') !== 'hub-secret' ||
        ![...challenges.values()].includes(challenge)
      )
        return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 });
      // runs out within the hub's margin: renewed when next opened
      return HttpResponse.json({
        access_token: `${body.get('code')}-access`,
        token_type: 'Bearer',
        refresh_token: 'ana-refresh',
        expires_in: 60,
      });
    }),
  );
  const start = async (cookie: string) => {
    const res = await http()
      .get(`/api/me/portals/${PORTAL}/oauth`)
      .set('cookie', cookie)
      .expect(302);
    const to = new URL(res.headers.location);
    const state = to.searchParams.get('state')!;
    challenges.set(state, to.searchParams.get('code_challenge')!);
    return { to, state };
  };
  const callback = (cookie: string, query: Record<string, string>) =>
    http()
      .get(`/api/me/portals/${PORTAL}/oauth/callback`)
      .query(query)
      .set('cookie', cookie);

  beforeAll(async () => {
    vi.stubEnv('PORTAL_LINKS', `${PORTAL}=oauth`);
    vi.stubEnv(
      'PORTAL_CREDENTIALS_SECRETS',
      `1:${randomBytes(32).toString('base64')}`,
    );
    portal.listen({ onUnhandledFrame: 'bypass' });
    app = await bootApp({ mails, imports: [ConsentModule] });
  });

  afterAll(async () => {
    await app.close();
    portal.close();
    vi.unstubAllEnvs();
  });

  it('sends the user to the consent page and links the account by the code it gives back, once', async () => {
    const ana = await signUp('ana@consent.test');
    const { to, state } = await start(ana);
    expect(to.origin + to.pathname).toBe(`${SERVER}/authorize`);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: 'hub',
      response_type: 'code',
      code_challenge_method: 'S256',
      redirect_uri: expect.stringMatching(
        new RegExp(`/api/me/portals/${PORTAL}/oauth/callback$`),
      ),
    });

    const done = await callback(ana, { code: 'ana', state }).expect(303);
    expect(done.headers.location).toBe('/api/me/portals');
    expect(
      (await callback(ana, { code: 'ana', state }).expect(400)).body.message,
    ).toMatch(/no consent of yours/);
    expect(
      (await http().get('/api/me/portals').set('cookie', ana).expect(200)).body,
    ).toEqual([
      {
        portal: PORTAL,
        mode: 'oauth',
        linked: true,
        status: 'linked',
        expiresAt: null,
      },
    ]);
    const prisma = app.get(PrismaService);
    const account = await prisma.portalAccount.findFirstOrThrow({
      where: { userId: await userId('ana@consent.test') },
    });
    expect(account).toMatchObject({ mode: 'oauth', portalUser: 'ana' });

    // opened for a run: renewed, as it ran out soon (by the poll linking
    // started, or by this), and the renewal kept
    const credential = await app
      .get(QueryBus)
      .execute(new AccountCredentialQuery(account.id));
    expect(bearerOf(credential!).reveal()).toBe('ana-renewed');

    // unlinked: taken back at the portal by the token it has now
    await http()
      .delete(`/api/me/portals/${PORTAL}/oauth`)
      .set('cookie', ana)
      .expect(204);
    expect(revoked).toEqual(['ana-renewed']);
    expect(
      await prisma.portalAccount.count({ where: { id: account.id } }),
    ).toBe(0);
  });

  it("links nothing for another user's state, nor for a consent said no to", async () => {
    const bo = await signUp('bo@consent.test');
    const cy = await signUp('cy@consent.test');
    const { state } = await start(bo);
    expect(
      (await callback(cy, { code: 'cy', state }).expect(400)).body.message,
    ).toMatch(/no consent of yours/);

    const again = await start(bo);
    await callback(bo, { error: 'access_denied', state: again.state }).expect(
      422,
    );
    expect(
      await app.get(PrismaService).portalAccount.count({
        where: {
          userId: {
            in: [
              await userId('bo@consent.test'),
              await userId('cy@consent.test'),
            ],
          },
        },
      }),
    ).toBe(0);
  });
});
