import { differs, type Upserted } from '../domain/changes.js';

// lock the record, find it by the portal's id, create if new,
// write only when something changed
export async function upsertTracked<T extends object>(
  data: Partial<T>,
  ops: {
    lock: () => Promise<void>;
    find: () => Promise<T | null>;
    create: () => Promise<T>;
    update: (current: T) => Promise<T>;
  },
): Promise<Upserted<T>> {
  await ops.lock();
  const current = await ops.find();
  if (!current)
    return { entity: await ops.create(), previous: null, changed: true };
  if (!differs(current, data))
    return { entity: current, previous: current, changed: false };
  return {
    entity: await ops.update(current),
    previous: current,
    changed: true,
  };
}
