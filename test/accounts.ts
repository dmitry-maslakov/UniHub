import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN_ROLE } from '../src/identity/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';

export const ORIGIN = 'http://localhost:3000';

// Signs people up the way a browser would, reading their mail from `mails`
// (the test's stand-in for the Mailer); what only an admin could do to a
// user (a role, a ban) is set in the database.
export function accounts(app: () => INestApplication, mails: Mail[]) {
  const http = () => request(app().getHttpServer());
  const post = (path: string, body: object, cookie = '') =>
    http()
      .post(`/api/auth${path}`)
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send(body);
  // the link in the last mail to someone
  const linkTo = async (to: string) => {
    const mail = await vi.waitFor(() => {
      const found = mails.findLast((m) => m.to === to);
      expect(found).toBeDefined();
      return found!;
    });
    return new URL(/https?:\/\/\S+/.exec(mail.text)![0]);
  };
  // a session cookie
  const signIn = async (email: string, password: string) => {
    const res = await post('/sign-in/email', { email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[]).join('; ');
  };
  const signUp = async (email: string, password = 'correct horse 1') => {
    await post('/sign-up/email', { email, password, name: 'Student' }).expect(
      200,
    );
    const link = await linkTo(email);
    await http()
      .get(link.pathname + link.search)
      .expect(302);
    return signIn(email, password);
  };
  const users = () => app().get(PrismaService).user;
  const userId = async (email: string) =>
    (await users().findUniqueOrThrow({ where: { email } })).id;
  const makeAdmin = (email: string) =>
    users().update({ where: { email }, data: { role: ADMIN_ROLE } });
  // banned for good, or no more
  const ban = (email: string, banned = true) =>
    users().update({ where: { email }, data: { banned } });
  return { http, post, linkTo, signIn, signUp, userId, makeAdmin, ban };
}
