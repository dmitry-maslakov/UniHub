import type { Json } from '@app/kernel';
import { Prisma } from '../../generated/prisma/client.js';

// a bare null is json too, but Prisma takes it only as JsonNull
export const jsonInput = (value: Json) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
