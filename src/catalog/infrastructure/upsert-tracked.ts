import { differs, type Upserted } from '../domain/changes.js';

// find by the portal's id, create if new, write only when something changed
export async function upsertTracked<T extends object>(
  data: Partial<T>,
  ops: {
    find: () => Promise<T | null>;
    create: () => Promise<T>;
    update: (current: T) => Promise<T>;
  },
): Promise<Upserted<T>> {
  const current = await ops.find();
  if (!current) return { entity: await ops.create(), changed: true };
  if (!differs(current, data)) return { entity: current, changed: false };
  return { entity: await ops.update(current), changed: true };
}
