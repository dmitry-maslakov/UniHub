import createFetchClient from 'openapi-fetch';
import createClient from 'openapi-react-query';
import type { paths } from './schema';

// The hub's REST API, typed from its OpenAPI document (web/openapi.json,
// npm run api:generate)
export const fetchClient = createFetchClient<paths>({
  baseUrl: window.location.origin,
});

export const api = createClient(fetchClient);
