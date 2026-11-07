// The only file other modules import from access. Not the module itself:
// accounts' use cases ask access's queries, and needn't load its routes and
// tools to. AppModule imports it from its own file.
export { mcp } from './infrastructure/mcp/mcp.strategy.js';
// a REST route counted against a named limit per user, as access's are
export { Limited } from './infrastructure/throttle.js';
// a page of a list, as access's routes take it
export { pageSchema } from './application/page.js';
export {
  OwnPortalCourseQuery,
  PickMatchesQuery,
  type PickMatch,
} from './application/queries.js';
