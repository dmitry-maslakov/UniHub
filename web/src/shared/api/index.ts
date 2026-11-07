export { api, fetchClient } from './api-client';
export { ApiError } from './api-error';
export { authClient, type Session } from './auth-client';
export { authError, type AuthError } from './auth-error';
export { errorCode } from './error-code';
export { errorKind } from './error-kind';
export { isNotFound } from './is-not-found';
export { readAllPages } from './read-all-pages';
import type { components } from './schema';

// The hub's response bodies, by the names OpenAPI gives them
export type Schemas = components['schemas'];
