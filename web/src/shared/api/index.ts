export { api, fetchClient } from './api-client';
export { ApiError } from './api-error';
export { authClient, type Session } from './auth-client';
export { authError, type AuthError } from './auth-error';
import type { components } from './schema';

// The hub's response bodies, by the names OpenAPI gives them
export type Schemas = components['schemas'];
