import createFetchClient from 'openapi-fetch';
import createClient from 'openapi-react-query';
import { ApiError } from './api-error';
import type { paths } from './schema';

// The hub's REST API, typed from its OpenAPI document (web/openapi.json,
// npm run api:generate). A refusal throws an ApiError, so a query or a
// mutation fails with the status, which openapi-react-query's own error
// (the body alone) would lose.
export const fetchClient = createFetchClient<paths>({
  baseUrl: window.location.origin,
});

fetchClient.use({
  async onResponse({ response }) {
    if (response.ok) return;
    throw new ApiError(
      response.status,
      await response
        .clone()
        .json()
        .catch(() => undefined),
    );
  },
});

export const api = createClient(fetchClient);
