// the only file other modules import from processing
export { ProcessingModule } from './processing.module.js';
export { PluginsOutboxTransport } from './infrastructure/plugins-outbox.transport.js';
export {
  ListTextsQuery,
  type TextInfo,
} from './application/queries/list-texts.query.js';
export {
  GetTextPageQuery,
  type TextPage,
} from './application/queries/get-text-page.query.js';
