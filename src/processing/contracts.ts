// The only file other modules import from processing. Not the module
// itself: loading it registers search through ConditionalModule, which
// throws unless the app's ConfigModule loads within 5 s, and access's specs
// load this file without one. AppModule imports it from its own file.
// for AppModule, which hands it to the outbox
export { PluginsOutboxTransport } from './infrastructure/plugins-outbox.transport.js';
// for main.ts: the run of APP_ROLE=models, and `npm run models:pending`
export { ModelsWorker } from './infrastructure/models.worker.js';
export { MODELS_QUEUE } from './infrastructure/models.queue.js';
export { exitCodeFor, pendingJobs } from './infrastructure/models.pending.js';
export { LEFT_OUT, type LeftOut } from './domain/unpacking.js';
export type { RecordKind } from './domain/records.js';
export {
  FindMemberQuery,
  GetPageTextsQuery,
  GetPostTextQuery,
  GetTextPageQuery,
  ListContainedQuery,
  ListMembersQuery,
  ListTextsQuery,
  SearchTextsQuery,
  type ContainedMember,
  type MemberContent,
  type MemberInfo,
  type RecordMatch,
  type SearchScope,
  type Snippet,
  type TextHit,
  type TextInfo,
  type TextPage,
} from './application/queries.js';
