import type { Readable } from 'node:stream';
import type { ContentHash, Instance, Json, PortalId } from '@app/kernel';
import type { AccountLink } from '@app/kernel';
import type { Credential } from './accounts.js';
import type { InvalidRecordError } from './errors.js';
import type { CourseRecord, FileRecord, ItemRecord } from './records.js';

// Connectors bring data in from a portal. One is written for one account;
// the hub runs it once per account: the shared one, or each user's own.
// poll: the hub calls poll() on the connector's schedule (a user's account
//       on a grid of its own, VIEW_MINUTES), never two runs of one account
//       at once.
// push: the connector keeps its own connection (websocket, long poll...) in
//       run(). Webhooks will come with the first connector that needs them.

interface ConnectorOptions<L extends AccountLink, I extends boolean> {
  portal: string;
  // how users may link accounts of their own on the portal, besides the
  // shared one; a connector that names any implements IdentifiesAccounts
  links?: readonly L[];
  // The portal is a product each school runs on a site of its own
  // (Canvas): a user's account is linked with its site's address, which
  // its credential carries (Credential.url), and the hub keeps each site's
  // records apart. A connector that says so implements HasInstances.
  instances?: I;
  // The portal is a public site with a directory of courses, which the
  // connector sends whole, every run, as its one (shared) account: users
  // pick from it (link mode public) and no course is asked for (Wanted, as
  // a gRPC connector's is). Of a poll connector.
  catalog?: boolean;
}

export interface PollConnectorOptions<
  L extends AccountLink = AccountLink,
  I extends boolean = boolean,
> extends ConnectorOptions<L, I> {
  // a cron pattern, e.g. '*/15 * * * *'
  schedule: string;
}

export type PushConnectorOptions<
  L extends AccountLink = AccountLink,
  I extends boolean = boolean,
> = ConnectorOptions<L, I>;

// What a connector of a portal with instances (instances: true) says of
// them.
export interface HasInstances {
  // The site its own settings read, for the shared account and for an
  // account linked before credentials carried their site (one with no
  // url); null when the settings name none.
  configuredInstance(): Instance | null;
}

// Whose a run is: the shared account, which the plugin's own settings give,
// or a user's own account, by the credential they linked. Reveal the
// credential only to make a request of the portal; it stays a Secret until
// then. A run the portal refuses the credential of rejects with
// CredentialRejectedError: the account reads nothing till it's linked
// again.
export type RunAccount =
  { kind: 'shared' } | { kind: 'user'; credential(): Promise<Credential> };

export interface ConnectorContext {
  // account is 'shared' for a portal read as shared, else a user's own
  // account's id: opaque, never a user
  connection: { portal: PortalId; account: string };
  account: RunAccount;
  // bound to that connection
  ingest: PortalIngest;
  // Aborts when the hub wants the run over: a poll past the hub's time for
  // one, or whose job another instance has taken over; the app shutting
  // down. Pass it to fetch() and the like, and stop soon after it aborts:
  // the hub lets go of a run that doesn't, and from then on its ingest
  // rejects every call with the signal's reason.
  signal: AbortSignal;
}

export interface PollsPortal {
  poll(ctx: ConnectorContext): Promise<void>;
}

export interface PushesFromPortal {
  // Runs until ctx.signal aborts, the connection kept up meanwhile. Ending
  // before that, or failing, is taken for a lost connection: the hub runs it
  // again, waiting longer each time it ends soon after starting.
  run(ctx: ConnectorContext): Promise<void>;
}

// how the account sees a record: locked for it (listed, not to be opened)
export interface Seen {
  locked?: boolean;
}

// One account's view of one course, sent as it sees it: every record the
// account sees there, then end(), then the content of the files file()
// said to fetch, once every pass of the run has ended (when a pass ends
// would otherwise tell how long the downloads before it took, and so what
// the hub had already). A course courses() didn't send is an
// UnknownReferenceError (at end(), for a user's account), and so is a
// file's item the pass didn't send before it. Records seen alike by several
// accounts are kept once, so leave out of a record what says how the
// account stands (read or not, its submission): it would make a version per
// account. A file's bytes are fetched once per version of them (its size
// and updatedAt), by the run that gets fetch: true; the others go on
// without them.
export interface CoursePass {
  // the record names this pass's course, or none
  item(record: ItemRecord, seen?: Seen): Promise<void>;
  // fetch: this run downloads the file's content and sends it once every
  // pass of the run has ended; false when the hub has it, or another run is
  // fetching it, or it's locked or too large
  file(record: FileRecord, seen?: Seen): Promise<{ fetch: boolean }>;
  // The account's view of the course is now what this pass sent, and what
  // it sent before but what `gone` names, by the portal's ids: what a
  // listing that went through to the end no longer has. A record a listing
  // that failed had stays, so a connector that can't tell gone from not
  // listed this time names none.
  end(gone?: { items?: string[]; files?: string[] }): Promise<void>;
  // content of a file of the pass, once every pass of the run has ended;
  // past the hub's limit for one file it is an InvalidRecordError
  // (CONTENT_TOO_LARGE)
  content(
    fileExternalId: string,
    content: Readable,
  ): Promise<{ hash: ContentHash }>;
}

// What a connector sends. A portal read as shared may be sent record by
// record (course, item, file, content, removals), as gRPC connectors do;
// courses() and pass() send what one account sees as a whole, and are the
// only way for a user's own account (the others are an InvalidRecordError,
// SHARED_ONLY).
export interface PortalIngest {
  // the courses the account is in, after a listing of them that went
  // through to the end: a user's account sees only these from now on. A
  // record the hub refuses is left out and named, with why (as `course()`
  // would reject it): skip its pass
  courses(records: CourseRecord[]): Promise<{
    refused: { externalId: string; error: InvalidRecordError }[];
  }>;
  pass(course: string): Promise<CoursePass>;
  course(record: CourseRecord): Promise<{ changed: boolean }>;
  item(record: ItemRecord): Promise<{ changed: boolean }>;
  // needsContent: the hub has no content for it yet, or it may have changed.
  // False for a size past the hub's limit for one file, which content()
  // would refuse
  file(
    record: FileRecord,
  ): Promise<{ changed: boolean; needsContent: boolean }>;
  // content of a file already sent with file(). Past the hub's limit for one
  // file it is an InvalidRecordError (CONTENT_TOO_LARGE), and so is every
  // resend: send it again only once file() answers changed for that file
  content(
    fileExternalId: string,
    content: Readable,
  ): Promise<{ hash: ContentHash; changed: boolean }>;
  // gone from the portal; sending it again brings it back.
  // Courses can't be removed yet.
  removeItem(externalId: string): Promise<{ changed: boolean }>;
  removeFile(externalId: string): Promise<{ changed: boolean }>;
  // whatever the connector saved on its previous run
  state(): Promise<Json | null>;
  saveState(state: Json): Promise<void>;
}
