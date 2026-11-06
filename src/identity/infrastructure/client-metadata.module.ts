import { Module } from '@nestjs/common';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';

// how Better Auth fetches an OAuth client's metadata document (CIMD)
export const CLIENT_METADATA_FETCH = Symbol('CLIENT_METADATA_FETCH');

// The cimd plugin's own Node transport: it resolves the host once, takes
// only public addresses, pins the connection to the one it checked and
// follows no redirect, which a wrapper around fetch can't. The e2e specs put
// a fake in its place, the documents at made-up hosts.
@Module({
  providers: [
    { provide: CLIENT_METADATA_FETCH, useValue: fetchClientMetadataResource },
  ],
  exports: [CLIENT_METADATA_FETCH],
})
export class ClientMetadataModule {}
