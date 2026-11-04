import { Prisma } from '../../generated/prisma/client.js';

// a transaction lost to a write conflict or a deadlock: worth retrying
export const isWriteConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2034';
