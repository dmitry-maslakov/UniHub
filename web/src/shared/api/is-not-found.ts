import { authError } from './auth-error';

// The hub or Better Auth answered 404: nothing there, which is not a failure
export const isNotFound = (error: unknown) => authError(error)?.status === 404;
