import { NotFoundException } from '@nestjs/common';

interface FindsByExternalId {
  findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<{ id: string } | null>;
}

// Maps a portal's id to ours. A reference to something the portal never sent
// is a bug in the plugin (it has to send the course before its items), so it
// fails instead of silently dropping the link.
export async function resolveId(
  repository: FindsByExternalId,
  portal: string,
  externalId: string | undefined,
) {
  if (externalId === undefined) return null;
  const found = await repository.findByExternalId(portal, externalId);
  if (!found)
    throw new NotFoundException(`${portal}: unknown reference ${externalId}`);
  return found.id;
}
