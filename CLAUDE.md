See @AGENTS.md as well.

## How we work

- Nest's (and the libraries') documented way first; nothing hand-rolled when a standard way exists
- issue per change, branch `feat/<issue>-<name>`, commits under the owner's name without AI trailers
- PR descriptions: `Closes #N` and 2–4 short bullets, no signature
- every PR gets one independent reviewer with no context but the diff, covering correctness, Nest and library canon, and architecture; agreed fixes go in, then the PR is merged right away. A declined point goes under Declined only if a later review would raise it again
- connectors for private portals never go into this repo; they run elsewhere and talk gRPC. Ones for public, documented platforms (Canvas) may, with all that belongs to one school (its address, tokens) in env only and made-up hosts and courses in fixtures
- a rule is unit-tested where it lives: the domain on its own, a use case on fakes of its ports. e2e specs check the wiring only (README, Tests), so a rule one of them checks belongs in a unit spec. The text analyzers' rules live in OpenSearch, so `search-analysis.e2e-spec.ts` checks them there

## Turned down or put off on review, to go through later

Declined:

- TypedSQL for the text queries: generating needs a live database, the client is generated on install (#35)
- graceful gRPC shutdown: Nest has no timeout for it (and no `unwrap()` for gRPC to add one), so one stalled upload would hold up the whole shutdown; uploads are cut instead, which is safe (sha256 at the end, the connector resends)
- swagger CLI plugin via `PluginMetadataGenerator`: explicit `@ApiProperty` instead
- `protoPath` from `import.meta.dirname`: rspack bundles, so it's `process.cwd()`; Docker WORKDIR must be the repo root
- connector token mapping to (portal, account): env tokens get replaced by API keys (#33), not extended
- `actorId` in course access commands: the admin check is `@Roles([ADMIN_ROLE])` on the routes that send them (access's `CourseAccessController`)
- a `source` column on course access (manual vs. from a portal): when per-user accounts come
- portal courses not linked to a course, of a portal read as shared: nobody reads them through the API, admins included. A portal read with users' own accounts shows its own to whoever's account sees them, as courses of their own (README, Portal accounts)
- tests of Better Auth's own device flow cases (deny, expiry, reuse)
- file-level access: files inherit their course's
- an app-wide limit per address: a campus behind NAT shares one address, so one script would lock everyone out. Better Auth limits `/api/auth` itself, MCP is limited per user
- env checked once in `ConfigModule.forRoot({ validationSchema })`: each module's `registerAs` factory checks and shapes its own settings (lists, maps, booleans), which a root check can't hand back to the namespaces
- `NODE_ENV` in `appConfig`: each namespace is checked on its own, so the rules that hold only in production read it there
- repositories typed `TransactionHost<TransactionalAdapterPrisma<…>>` instead of `@InjectTransactionHost()`: the `PrismaTxHost` alias leaves DI no class to read, the decorator names it
- one kind-to-answer table for HTTP and gRPC: each transport answers with its own exceptions
- `auth:generate` without a valid `.env`: the CLI reads the same checked settings as the app (README: set the secret first)
- `ConditionalModule.registerWhen` for `APP_ROLE`, to leave the workers out of an api process: it reads the environment once per process, so one e2e spec couldn't boot an api and a worker side by side. The libraries' own switches read the role per app instead (`BullRegistrar.register()`, the scheduler's options, the outbox's `relay.enabled`), and `ConnectorsWorker` and `SearchIndexWorker` check it before closing a worker that an api process never registered
- racing an unpacker's `next()` against the walk's signal: an unpacker passes the signal to every wait (the sdk says so), and a race would only leave one that stalls anyway behind, still holding what it opened: `return()` waits for the `next()` before it

Put off:

- failed API key attempts limited per address, counting only failures: each costs a database lookup (caddy has no rate limits without a plugin). Not a limit on all calls per address. The named limits are access's, a route counted against one by `@Limited(name)` while the others skip it (`skipIf`); this one would join them with a tracker of its own
- Better Auth's rate limits in Redis (`secondaryStorage`): in memory is right for the one instance there is; with a second one, they'd need sharing
- Better Auth reads the client's address from `X-Forwarded-For` regardless of `TRUST_PROXY`: right behind caddy, which overwrites it; in production the app runs only behind it
- monitoring: traces, errors and logs go to NestJS Observe (see AGENTS.md), on OpenTelemetry's global providers; the metrics stay on the app's own `MeterProvider`, served only to a scraper on `METRICS_PORT` (README, Metrics), so neither gets the other's. Alerts on them (downtime, dead letters, a connector's last success) are the scraper's to set; disk space isn't among them
- connector API keys, and moving the "portal both built-in and external" check to key creation (#33)
- cursor paging for MCP, if agents need it
- OAuth for MCP clients (claude.ai connectors need it); API keys until then
- an `Origin` allowlist on the MCP transport (the spec asks for it against DNS rebinding); MCP takes no cookies, so a page can't call it as the user
- MCP tools answer JSON as text, not `structuredContent` with an `outputSchema`
- device sign-in: approval screen details and shorter device sessions, with the web portal
- helmet's `Cross-Origin-Resource-Policy: same-origin` stops another origin embedding file content (`<img>`, `<iframe>`); `same-site` if the web portal lives on a sibling subdomain
- grants of a deleted course: when catalog can delete courses (an event for identity)
- a read alias for the search index, moved to a new one (another generation or model) once the reconcile has filled it: until then searches answer from the new one, partly filled (README, Search index)
- a floor for the meaning part of a search (knn's `min_score`, a radial search): it needs a value measured per model; until then, with an embedder, a search answers up to `limit` files even when none has the words (README, Search)
- OpenSearch's security plugin, with TLS certificates and users of its own (`OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD`): needed once anything past the one compose network reaches it, a second host; until then it's off and its port isn't published (README, Deploying search)
- searches through more than 65,536 contents (`index.max_terms_count`, an admin's the first to get there): contents numbered, so `terms` can take them as a bitmap, or the ones not to find left out (`must_not`) instead; neither tried. The members of archives with a text count among them, and bring it closer; posts, files and archives are ids of their own, a filter each with its own count
- OpenSearch 3.10's fusion mode for the hybrid query
- vectors as `half_float` should memory run short: a new generation
- a file renamed is found by its new name from the next hourly reconcile on: catalog records no event for a rename or a move (`FILE_CONTENT_CHANGED` is content's), and one for plugins would be another sdk topic
- a post's text is every string of its `raw` but links and dates: the hub knows no portal's field names, so a portal's ids and enums (`online_upload`, `application/pdf`) are words too. A connector naming the fields that hold its text (the sdk's `ItemRecord`, the proto) would make it exact
- paging search results: one window of up to 50 contents now
- a CI job on real TEI servers with small models: the adapters are checked against msw's answers, the e2e specs run on fake models
- random access for unpackers, a container's size and a ranged `content()` over its blob (yauzl's `RandomAccessReader`): an unpacker gets a stream from the start, as a processor does, so a zip, its directory at its end, is read whole into memory up to the unpacker's limit; when memory calls for it
- search in health and monitoring (`/api/health/search`, OpenSearch's disk; the `search-index` queue's backlog and its outages are metrics now): `/api/health` leaves search out, so an index away doesn't take down the app caddy waits on
- trees keyed by content and unpacker, with a second unpacker: one tree per content now, so the same bytes in files two unpackers take (`x.zip`, `x.epub`) would be walked by turns, each seeing the other's tree as not current
- the columns of `PortalCourse`, `Item` and `File` from before versions, and the triggers that refuse what an app from before still writes to them (`20261106120000_catalog_versions`): dropped by a later migration, once no app from before runs
- a version a pass hides from the last view that showed it leaves the search index at the next hourly reconcile (its hiding can be from a slot to come, which no event marks); one an unlinked account alone saw leaves at once
- versions no account sees any longer are kept, not collected: the shared account's are changed in place and a removed record's stays for when it comes back, so only linked accounts' views leave any behind, a version each time one changes on the portal
- content opens with the view that opens it (`openFrom`), processed and indexed or not: where the processors or the index are still at it past the hold, its texts and search hits come later, which tells a reader it was new to the hub; opening only once it's complete would need a record of a content's processing done or given up, which the hub doesn't keep
- an account unlinked, replaced by another portal user's or its user deleted is removed first, and plugins then forget its schedule, its sync state and its sights (`AccountsChangedCommand`): a failure in between leaves them, read by no one (no viewer is it any longer), and so does a run of it still going; a sweep against the accounts there are, once it matters
- bodies with a version stamp fetched once per version (the design's `sight(externalId, version)`, the record sent only when the hub lacks it): Canvas lists its pages with their bodies, so a body costs no request of its own; a portal that serves each body by a request of its own would want it
- a lock that comes for a version an account sees takes hold at its pass, not at its slot: a sight has one `open`, and it tells only the account's own user anything. One that goes opens at the pass's hold
- a user's token's expiry is the one the portal gave at linking: a run doesn't renew it (the design's `expiresAt(at)`), and finds it `revoked` once the portal refuses it
- a fetch lease isn't released: a run that took one and failed the download keeps that version's bytes from the other accounts' runs for the lease's time, as long as a run may take (`CONNECTOR_POLL_TIMEOUT_MINUTES`)
- `CONNECTOR_CONCURRENCY` is per worker process and for every portal at once, not per portal
- OAuth as a link mode, for a school that issues a developer key: built on branch `feat/135-oauth-mode` and kept there (openid-client with PKCE, the consent's state single-use in Redis, renewal, revoke on unlink); `shared` and `token` until then
- the `connector` mode: a user's own connector, with #33's keys bound to the user's account, accounts over gRPC
- a deleted user's accounts go by an event Better Auth's delete hook sends once the delete has committed, on the in-process bus: a crash in between leaves them, unreachable (no session is the user's); a sweep against identity's users, once something reads with accounts
- a malformed JSON body's 400 quotes a few characters of it (V8's `JSON.parse` message, which Nest answers with): a token sent so shows a part of itself to its own sender, and isn't logged

Done the standard way after all: global prefix, gRPC guard (#36).
