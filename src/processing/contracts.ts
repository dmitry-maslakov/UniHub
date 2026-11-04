// The only file other modules import from processing. Not the module
// itself: loading it registers search through ConditionalModule, which
// throws unless the app's ConfigModule loads within 5 s, and access's specs
// load this file without one. AppModule imports it from its own file.
// for AppModule, which hands it to the outbox
export { PluginsOutboxTransport } from './infrastructure/plugins-outbox.transport.js';
export type { Snippet } from './application/ports.js';
export {
  GetTextPageQuery,
  ListTextsQuery,
  SearchTextsQuery,
  type TextHit,
  type TextInfo,
  type TextPage,
} from './application/queries.js';
