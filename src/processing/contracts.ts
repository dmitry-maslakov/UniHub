// the only file other modules import from processing
export { ProcessingModule } from './processing.module.js';
// for AppModule, which hands it to the outbox
export { PluginsOutboxTransport } from './infrastructure/plugins-outbox.transport.js';
export {
  GetTextPageQuery,
  ListTextsQuery,
  type TextInfo,
  type TextPage,
} from './application/queries.js';
