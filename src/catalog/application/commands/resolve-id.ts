import { UnknownReferenceError } from '../../domain/errors.js';

interface FindsByExternalId {
  findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<{ id: string } | null>;
}

// Maps a portal's id to ours. A reference to something the portal never sent
// is a bug in the plugin, so it fails instead of silently dropping the link.
export async function resolveId(
  repository: FindsByExternalId,
  portal: string,
  externalId: string | null,
) {
  if (externalId === null) return null;
  const found = await repository.findByExternalId(portal, externalId);
  if (!found) throw new UnknownReferenceError(portal, externalId);
  return found.id;
}
