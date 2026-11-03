import * as catalog from '../catalog/contracts.js';

// Where each outbox topic goes. A topic missing here fails to publish, gets
// retried, dead-lettered and logged, instead of being dropped quietly.
const ROUTES: Record<string, string> = {
  [catalog.ITEM_CHANGED]: 'plugins',
  [catalog.ITEM_REMOVED]: 'plugins',
  [catalog.FILE_CONTENT_CHANGED]: 'plugins',
  [catalog.FILE_REMOVED]: 'plugins',
};

export function routeFor(topic: string) {
  const transport = ROUTES[topic];
  if (!transport) throw new Error(`no outbox route for ${topic}`);
  return transport;
}
