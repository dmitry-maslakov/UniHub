import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import {
  ClsPluginTransactional,
  NoOpTransactionalAdapter,
} from '@nestjs-cls/transactional';
import type { PortalId, Secret } from '@app/kernel';
import {
  ListPortalCatalogQuery,
  type CatalogCourseDto,
} from '../../catalog/contracts.js';
import { FakeBus } from '../../../test/fake-bus.js';
import { CredentialVault, type SealedFor } from '../domain/credential-vault.js';
import { UnreadableCredentialError } from '../domain/errors.js';
import { PickRepository } from '../domain/picks.js';
import {
  PortalAccount,
  PortalAccountRepository,
  type PortalAccountState,
} from '../domain/portal-account.js';
import { PortalLinks } from '../domain/portal-links.js';
import {
  WantedCourse,
  WantedCourseRepository,
} from '../domain/wanted-course.js';
import { PortalPicks } from './portal-picks.js';

// In-memory ports for the application's unit tests.

// each user's accounts by "user:portal", as last saved, with what sealed
// their credential
export class InMemoryAccounts extends PortalAccountRepository {
  readonly rows = new Map<
    string,
    { account: PortalAccountState; sealed: string }
  >();

  async find(userId: string, portal: PortalId) {
    const row = this.rows.get(`${userId}:${portal}`);
    return row ? PortalAccount.restore(row.account) : null;
  }

  async ofUser(userId: string) {
    return [...this.rows.values()]
      .filter(({ account }) => account.userId === userId)
      .map(({ account }) => PortalAccount.restore(account));
  }

  async linkedOf(portal: PortalId, now: Date) {
    return [...this.rows.values()]
      .map(({ account }) => PortalAccount.restore(account))
      .filter((a) => a.portal === portal && a.statusAt(now) === 'linked');
  }

  async withCredential(id: string) {
    const row = [...this.rows.values()].find((r) => r.account.id === id);
    return row
      ? { account: PortalAccount.restore(row.account), sealed: row.sealed }
      : null;
  }

  async saveStatus(account: PortalAccount, sealed: string) {
    const { userId, portal, status } = account.snapshot;
    const row = this.rows.get(`${userId}:${portal}`);
    if (row?.account.id === account.id && row.sealed === sealed)
      row.account = { ...row.account, status };
  }

  async save(account: PortalAccount, sealed: string) {
    const state = account.snapshot;
    this.rows.set(`${state.userId}:${state.portal}`, {
      account: state,
      sealed,
    });
  }

  async remove(userId: string, portal: PortalId) {
    const key = `${userId}:${portal}`;
    const id = this.rows.get(key)?.account.id ?? null;
    this.rows.delete(key);
    return id;
  }

  async removeAllOf(userId: string) {
    const removed: { id: string; portal: PortalId }[] = [];
    for (const [key, { account }] of this.rows)
      if (account.userId === userId) {
        removed.push({ id: account.id, portal: account.portal });
        this.rows.delete(key);
      }
    return removed;
  }
}

// what a sealed credential is bound to, as one key
const key = ({ id, userId, portal }: SealedFor) => `${id}:${userId}:${portal}`;

// seals as "sealed-<n>", keeping what each was, for its account only
export class FakeVault extends CredentialVault {
  private readonly kept: { credential: Secret; boundTo: string }[] = [];

  seal(credential: Secret, account: SealedFor) {
    this.kept.push({ credential, boundTo: key(account) });
    return `sealed-${this.kept.length - 1}`;
  }

  open(sealed: string, account: SealedFor) {
    const kept = this.kept[Number(sealed.slice('sealed-'.length))];
    if (kept?.boundTo !== key(account)) throw new UnreadableCredentialError();
    return kept.credential;
  }
}

// each user's picks, in the order made
export class InMemoryPicks extends PickRepository {
  readonly rows: { userId: string; portalCourseId: string }[] = [];
  // whose picks were locked, in order
  readonly locked: string[] = [];

  async ofUser(userId: string) {
    return this.rows
      .filter((row) => row.userId === userId)
      .map(({ portalCourseId }) => portalCourseId)
      .sort();
  }

  async lockOf(userId: string) {
    this.locked.push(userId);
    return this.ofUser(userId);
  }

  async add(userId: string, portalCourseId: string) {
    if (!(await this.ofUser(userId)).includes(portalCourseId))
      this.rows.push({ userId, portalCourseId });
  }

  async remove(userId: string, portalCourseId: string) {
    const at = this.rows.findIndex(
      (row) => row.userId === userId && row.portalCourseId === portalCourseId,
    );
    if (at < 0) return null;
    this.rows.splice(at, 1);
    return this.rows.filter((row) => row.portalCourseId === portalCourseId)
      .length;
  }

  async picked() {
    return [...new Set(this.rows.map(({ portalCourseId }) => portalCourseId))];
  }
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

// the courses wanted, each until when
export class InMemoryWanted extends WantedCourseRepository {
  readonly rows = new Map<string, Date | null>();

  async all() {
    return [...this.rows].map(([id, until]) => new WantedCourse(id, until));
  }

  async save({ portalCourseId, until }: WantedCourse) {
    this.rows.set(portalCourseId, until);
  }

  async replace(was: WantedCourse, course: WantedCourse | null) {
    const { portalCourseId } = was;
    if (
      !this.rows.has(portalCourseId) ||
      !sameTime(this.rows.get(portalCourseId)!, was.until)
    )
      return;
    if (course) this.rows.set(portalCourseId, course.until);
    else this.rows.delete(portalCourseId);
  }
}

// catalog, with these courses of each portal
export const catalogBus = (catalogs: Record<string, CatalogCourseDto[]>) =>
  new FakeBus([
    [
      ListPortalCatalogQuery,
      ({ portal, externalId }: ListPortalCatalogQuery) =>
        (catalogs[portal] ?? []).filter(
          (course) =>
            externalId === undefined || course.externalId === externalId,
        ),
    ],
  ]);

// PortalPicks on these fakes; @Transactional() runs, without a database
export async function picksOnFakes(links: PortalLinks, queries: FakeBus) {
  const fakes = { picks: new InMemoryPicks(), wanted: new InMemoryWanted() };
  const module = await Test.createTestingModule({
    imports: [
      ClsModule.forRoot({
        plugins: [
          new ClsPluginTransactional({
            adapter: new NoOpTransactionalAdapter({
              tx: {},
              disableWarning: true,
            }),
          }),
        ],
      }),
    ],
    providers: [
      PortalPicks,
      { provide: PortalLinks, useValue: links },
      { provide: PickRepository, useValue: fakes.picks },
      { provide: WantedCourseRepository, useValue: fakes.wanted },
      { provide: QueryBus, useValue: queries.queries },
    ],
  }).compile();
  await module.init();
  return { service: module.get(PortalPicks), ...fakes };
}
