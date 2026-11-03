See @AGENTS.md as well.

## How we work

- Nest's (and the libraries') documented way first; nothing hand-rolled when a standard way exists
- issue per change, branch `feat/<issue>-<name>`, commits under the owner's name without AI trailers
- PR descriptions: `Closes #N` and 2–4 short bullets, no signature
- every PR is reviewed by independent agents (Nest canon, architecture, correctness) with no context but the diff; agreed fixes go in, then the PR is merged right away
- connectors for private portals (ACS) never go into this repo; they run elsewhere and talk gRPC

## Turned down or put off on review, to go through later

Declined:

- TypedSQL for the text queries: generating needs a live database, the client is generated on install (#35)
- swagger CLI plugin via `PluginMetadataGenerator`: explicit `@ApiProperty` instead
- `protoPath` from `import.meta.dirname`: rspack bundles, so it's `process.cwd()`; Docker WORKDIR must be the repo root
- connector token mapping to (portal, account): env tokens get replaced by API keys (#33), not extended
- `actorId` in course access commands: the admin check is `@Roles(['admin'])` at the route
- a `source` column on course access (manual vs. from a portal): when per-user accounts come
- portal courses not linked to a course: nobody reads them through the API, admins included
- tests of Better Auth's own device flow cases (deny, expiry, reuse)
- file-level access: files inherit their course's

Put off:

- API key guard for HTTP, per-key throttling, `deferUpdates`, ban check on keys: MCP (#16)
- helmet with a CSP for `/api/docs`, `@nestjs/throttler`, client IP behind the proxy, Better Auth rate limits in Redis, `trustedOrigins`, gRPC behind TLS, a `stop_grace_period` that bounds the graceful gRPC shutdown: deploy (#17)
- connector API keys, and moving the "portal both built-in and external" check to key creation (#33)
- cursor paging for MCP, if agents need it
- device sign-in: approval screen details and shorter device sessions, with the web portal
- grants of a deleted course: when catalog can delete courses (an event for identity)

Done the standard way after all: global prefix, gRPC guard, graceful gRPC shutdown (#36).
