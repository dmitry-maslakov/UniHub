// the only file other modules import from access
export { AccessModule } from './access.module.js';
export { mcp } from './infrastructure/mcp/mcp.strategy.js';
// a REST route counted against a named limit per user, as access's are
export { Limited } from './infrastructure/throttle.js';
// a page of a list, as access's routes take it
export { pageSchema } from './application/page.js';
