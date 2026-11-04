See @AGENTS.md as well.

## How we work

- Nest's (and the libraries') documented way first; nothing hand-rolled when a standard way exists
- issue per change, branch `feat/<issue>-<name>`, commits under the owner's name without AI trailers
- PR descriptions: `Closes #N` and 2–4 short bullets, no signature
- every PR gets one independent reviewer with no context but the diff, covering correctness, Nest and library canon, and architecture; agreed fixes go in, then the PR is merged right away. A declined point goes under Declined only if a later review would raise it again
- connectors for private portals never go into this repo; they run elsewhere and talk gRPC. Ones for public, documented platforms (Canvas) may, with all that belongs to one school (its address, tokens) in env only and made-up hosts and courses in fixtures
- a rule is unit-tested where it lives: the domain on its own, a use case on fakes of its ports. e2e specs check the wiring only (README, Tests), so a rule one of them checks belongs in a unit spec

## Turned down or put off on review, to go through later

Declined:

- TypedSQL for the text queries: generating needs a live database, the client is generated on install (#35)
- graceful gRPC shutdown: Nest has no timeout for it (and no `unwrap()` for gRPC to add one), so one stalled upload would hold up the whole shutdown; uploads are cut instead, which is safe (sha256 at the end, the connector resends)
- swagger CLI plugin via `PluginMetadataGenerator`: explicit `@ApiProperty` instead
- `protoPath` from `import.meta.dirname`: rspack bundles, so it's `process.cwd()`; Docker WORKDIR must be the repo root
- connector token mapping to (portal, account): env tokens get replaced by API keys (#33), not extended
- `actorId` in course access commands: the admin check is `@Roles([ADMIN_ROLE])` on the routes that send them (access's `CourseAccessController`)
- a `source` column on course access (manual vs. from a portal): when per-user accounts come
- portal courses not linked to a course: nobody reads them through the API, admins included
- tests of Better Auth's own device flow cases (deny, expiry, reuse)
- file-level access: files inherit their course's
- an app-wide limit per address: a campus behind NAT shares one address, so one script would lock everyone out. Better Auth limits `/api/auth` itself, MCP is limited per user
- env checked once in `ConfigModule.forRoot({ validationSchema })`: each module's `registerAs` factory checks and shapes its own settings (lists, maps, booleans), which a root check can't hand back to the namespaces
- `NODE_ENV` in `appConfig`: each namespace is checked on its own, so the rules that hold only in production read it there
- repositories typed `TransactionHost<TransactionalAdapterPrisma<…>>` instead of `@InjectTransactionHost()`: the `PrismaTxHost` alias leaves DI no class to read, the decorator names it
- one kind-to-answer table for HTTP and gRPC: each transport answers with its own exceptions
- `auth:generate` without a valid `.env`: the CLI reads the same checked settings as the app (README: set the secret first)

Put off:

- failed API key attempts limited per address, counting only failures: each costs a database lookup (caddy has no rate limits without a plugin). Not a limit on all calls per address. The named limits are access's, a route counted against one by `@Limited(name)` while the others skip it (`skipIf`); this one would join them with a tracker of its own
- Better Auth's rate limits in Redis (`secondaryStorage`): in memory is right for the one instance there is; with a second one, they'd need sharing
- Better Auth reads the client's address from `X-Forwarded-For` regardless of `TRUST_PROXY`: right behind caddy, which overwrites it; in production the app runs only behind it
- images built and tagged in CI (ghcr) instead of on the server, for rollbacks without a rebuild
- monitoring: NestJS Observe (see AGENTS.md), alerts on downtime, disk space and dead letters; failed jobs only reach the logs now
- connector API keys, and moving the "portal both built-in and external" check to key creation (#33)
- cursor paging for MCP, if agents need it
- OAuth for MCP clients (claude.ai connectors need it); API keys until then
- an `Origin` allowlist on the MCP transport (the spec asks for it against DNS rebinding); MCP takes no cookies, so a page can't call it as the user
- MCP tools answer JSON as text, not `structuredContent` with an `outputSchema`
- device sign-in: approval screen details and shorter device sessions, with the web portal
- helmet's `Cross-Origin-Resource-Policy: same-origin` stops another origin embedding file content (`<img>`, `<iframe>`); `same-site` if the web portal lives on a sibling subdomain
- grants of a deleted course: when catalog can delete courses (an event for identity)

Done the standard way after all: global prefix, gRPC guard (#36).
