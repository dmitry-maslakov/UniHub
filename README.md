# UniHub

A hub for learning materials: connectors bring in courses, posts and files from any portal, processors turn files into readable text, and students and AI agents read it all over REST and MCP.

## Running locally

Needs Node 24+ and Docker.

```bash
cp .env.example .env   # then set BETTER_AUTH_SECRET
docker compose up -d   # postgres, redis and OpenSearch
npm install
npx prisma migrate dev
npm run start:dev
```

OpenSearch needs `vm.max_map_count` of at least 262144, which Docker Desktop has; on Linux, `sudo sysctl -w vm.max_map_count=262144`.

## Layout

- `src/` — the hub: its modules (`catalog`, `ingest`, `storage`, `processing`, `plugins`, `identity`, `access`), each used by the others only through its `contracts.ts` (a lint rule checks it)
- `src/platform/` — what the modules run on: `database` (Prisma, `@Transactional()`), `redis`, `queues` (BullMQ), `messaging` (the outbox; `AppModule` names its transports), `errors` (one answer per kind of domain error), `validation` (a route's schemas), `search` (the OpenSearch client); `app.module.ts` lists the modules and wires them into the platform, `app.setup.ts` sets the app up (HTTP, MCP and gRPC) for `main.ts` and the e2e tests alike
- `libs/plugin-sdk` — everything a plugin may depend on, plugins never import the core directly; its `host.ts` is the hub's side (how it finds plugins), which plugins can't import
- `libs/plugins/` — the built-in plugins (`canvas`, `office-text`, `plain-text`), each on the sdk alone. A worker thread's file is run by node as it is in the tests, types stripped, so it and what it imports name each other's `.ts` (`rewriteRelativeImportExtensions` lets tsc take that)
- `libs/kernel` — what the hub's modules and the sdk share: values that hold the same rules everywhere (`ContentHash`, `MediaType`, `PortalId`, `PluginName`, `Json`) and the kinds of domain error (not found, conflict, invalid, unavailable)
- `prisma/schema/` — one schema file per module
- `npm install` generates the Prisma client and the gRPC types (`src/ingest/infrastructure/grpc/generated`, from `proto/ingest.proto`); neither is committed

A module has up to three layers, and a rule is written once, in the one that owns it:

- `domain/` — the rules. Aggregates keep their own record's invariants and record its events (catalog's `PortalFile`, `Item`); rules over several things are functions or classes of their own (`placeFile`, `PluginSet`, `Reader` with `ReadScope` and `Ban`). It also declares the ports the module needs, as abstract classes. It may import the kernel and plain libraries (zod, `node:crypto`); a lint rule keeps out other modules, application and infrastructure code, the platform, Prisma, the sdk, and all of Nest but `AggregateRoot` from `@nestjs/cqrs`
- `application/` — the use cases: load an aggregate, call it, save it in one transaction; or ask other modules over the bus and put their answers together (access's `CourseReader` only orchestrates catalog and identity). No SQL, no queues
- `infrastructure/` — what the ports are made of: Prisma repositories (a record and its events go to the outbox in the same transaction), queries that read straight into DTOs past the aggregates (`read/`), BullMQ, the file store; and the ways in (HTTP, MCP, gRPC), which only check what comes in against its schema and hand it on

## Tests

```bash
npm test               # unit specs: no database, a few seconds
docker compose up -d   # e2e specs need postgres, redis and OpenSearch
npm run test:e2e
```

- unit specs (`*.spec.ts`, next to the code) check the rules: the domain on its own, the use cases on in-memory fakes of their ports (`*.fakes.ts` beside them; `test/` has the shared ones: `FakeBus`, `InMemoryBlobs`, `sha256` of real content, plugins as discovery finds them)
- e2e specs (`test/*.e2e-spec.ts`) check only what fakes can't: how records are written and read back, what the read queries find and in what order, the locks, the outbox rolling back with its transaction, BullMQ's deduplication, gRPC, each route and MCP tool once (and one bad request to each that declares a schema, since nothing else sees it is attached), the whole pipeline once (`plugins.e2e-spec.ts`), the search index's writes and their repair (`search-index.e2e-spec.ts`), the app with search off (`search-off.e2e-spec.ts`), and the text index's analyzers, whose rules live in OpenSearch (`search-analysis.e2e-spec.ts`: a word in Cyrillic, in Latin and without diacritics gives the same tokens, on the OpenSearch client alone). The others boot the app as `main.ts` sets it up (`bootApp()` in `test/app.ts`) on a database, redis db, folder and search indices (`unihub-e2e-*`) of their own (`test/env.ts`), made anew for every run, and wait for what they wait on (the outbox's events, a job's state), never for a while

## Users

[Better Auth](https://better-auth.com) serves `/api/auth/*`:

- email and password, the email confirmed by a link in a mail (without `SMTP_URL` mails only go to the log)
- Google, when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- sign-in by QR code: a new screen asks for a code (device authorization), a phone signed in within the last day approves it
- session tokens as `Authorization: Bearer`, and API keys for MCP clients: only a session signed in within the last day makes one, they expire after 90 days, and a new password (a reset, a change, or one an admin sets) deletes them

The first admin: `npm run auth:create-admin -- --email you@example.com --password '…'`. After adding a Better Auth plugin, `npm run auth:generate` updates `prisma/schema/identity.prisma`.

Every HTTP route needs a signed-in user unless it says `@AllowAnonymous()`. Admins read every course, other users the ones an admin granted them, a banned user nothing (by API key either).

## REST API

OpenAPI at `/api/docs`. A signed-in user reads the courses they were given:

- `GET /api/courses`, then `/api/courses/{slug}/items` and `/files` (`offset`, `limit` up to 200, 50 by default)
- `GET /api/files/{id}`: the file and the texts made from it
- `GET /api/files/{id}/text?page=2`: one page, slide or section of a text
- `GET /api/files/{id}/content`: the file itself

Everything goes through `CourseReader` (`src/access`), which MCP shares; 1200 calls a minute per user.

Admins set the courses up (`@Roles([ADMIN_ROLE])`):

- `POST /api/courses` with `{ slug, name }`: a course
- `PUT /api/portal-courses/{portal}/{externalId}/course` with `{ course, year }`: the portal course becomes part of that course (no `year` for one that spans years); one linked elsewhere moves
- `DELETE /api/portal-courses/{portal}/{externalId}/course`: unlinks it
- `PUT /api/users/{userId}/courses/{courseId}`: the user reads the course, named by the id `POST /api/courses` answered (users' ids from Better Auth's `GET /api/auth/admin/list-users`); `DELETE` on the same path takes it back. An id no user has is a 404, and so is granting one no course has

## MCP

`/api/mcp` serves the same reads to AI clients over streamable HTTP, as the tools `list_courses`, `list_items`, `list_files` and `read_file` (page by page). A client signs in with an API key (create one at `POST /api/auth/api-key/create`), sent as `X-API-Key` or `Authorization: Bearer`; 600 calls a minute per user, however many keys they have. A request carries one JSON-RPC message as JSON: other bodies get 415, batches 400.

## Plugins

A plugin is a Nest module that depends only on `@app/plugin-sdk` (a lint rule checks it):

- `@PollConnector({ portal, schedule })` — the hub calls `poll(ctx)` on the cron schedule (or at once on `SyncConnectionCommand`), one run per account at a time. `ctx.signal` aborts past `CONNECTOR_POLL_TIMEOUT_MINUTES` (60), when another instance has taken the run over, or at shutdown; the hub lets go of the run then, and the next one goes on from the state it saved
- `@PushConnector({ portal })` — `run(ctx)` keeps its own connection until `ctx.signal` aborts, only on the instance with `RUN_CONNECTORS=true`. A run that ends or fails is started again after a second, then twice as long each time it ends soon again, up to `CONNECTOR_RESTART_MAX_SECONDS` (60); a run that stayed up longer than that starts over at a second; at shutdown all are stopped at once, each given `CONNECTOR_STOP_SECONDS` (10)
- either way data goes in only through `ctx.ingest`, bound to `ctx.connection` (the portal and account). A record it refuses rejects with `InvalidRecordError` (fix it or skip it) or `UnknownReferenceError` (send what it refers to first), and their `reason` says which rule it broke, the same reasons gRPC connectors get
- `@ContentProcessor({ name, version, accepts })` turns file content into text for models, once per content and version whichever files hold it; it gets only files it accepts, and `input.matched` says which `accepts` entry the file matched (its extension first, then its media type). The sdk's `readUpTo` reads content up to a limit and `firstMessage` waits for a worker thread that parses it, as the built-in processors do
- `@Aggregator({ name, topics })` reacts to messages (`item.ingested`, `item.removed`, `file.content-stored`, `file.removed`) and reads the rest through `HubReader`; `handle()` is typed by the topics, so one that doesn't handle them all doesn't compile

Built-in processors, each parsing in a worker thread of its own with 512 MB of heap:

- `office-text` (`libs/plugins/office-text`) turns pdf, pptx, docx, odt, odp, html, rtf and epub into text: part n of a pdf or a deck is page or slide n (empty where it has no text), a document or a page has a part per section (a long one goes on in the next part past 10,000 characters, a page's scripts and styles are left out). It's given up to 100 MiB of content and 3 minutes
- `plain-text` (`libs/plugins/plain-text`) turns source code, plain text, markdown, Jupyter notebooks and data files (csv, json, yaml, xml…) into text, taken by extension or media type (listed in its `formats.ts`). It finds the encoding (UTF-8, UTF-16 with or without a BOM, windows-1250 and 1251, ISO-8859-2 and 5, DOS's cp852 and cp855), line by line in a file that is UTF-8 in places and a code page in others; lines end in LF and letters are composed (NFC). Markdown up to 1 MiB and notebooks (markdown and code cells, with their text outputs but no pictures) have a part per section, from one heading to the next (a `#` in a code block is none); the rest comes in whole lines, up to 10,000 characters a part, a longer line cut at a space or else at 10,000. A text file's parts joined give it back. Binary content, minified code (`*.min.js`, `*.min.css`) and files past 16 MiB (64 MiB for a notebook) get no parts; it's given a minute

The two take different formats. A file they both match, an `.html` a portal calls `text/plain`, has a text of each, and a page asked for without a processor is office-text's. Results are stored per content hash and processor version, and a reconcile at startup and every day queues whatever is missing.

Each aggregator gets a queue job of its own per message, each processor one per content it takes, so one failing plugin only retries itself; a job that gives up for good is logged. Built-in plugins are listed in `src/plugins/enabled.ts` and turned on by name in `PLUGINS`; `test/fake-plugins.ts` shows one of each.

### Search index

With `OPENSEARCH_URL` set, the texts also go into an OpenSearch index (`<OPENSEARCH_INDEX_PREFIX>-texts-g1-bm25`), its analyzers taking a word in Cyrillic, in Latin and without diacritics alike:

- each page is cut into chunks of up to 1200 characters, at a paragraph, line or word break, its letters composed (NFC)
- a `search-index` queue, one job at a time, writes the newest version of each text the processors store: its chunks, then a manifest that says the text is in whole, then it drops its other versions, a newer one postgres lost too. While OpenSearch or the database is away, or OpenSearch's disk is past its flood stage, the queue waits 30 s at a time without spending attempts, and logs it as an error every 10 minutes it goes on
- a reconcile at startup (tried again every 30 s while OpenSearch is still starting, for 10 minutes) and every hour queues what the index lacks and what it still holds of other versions or removed texts
- the index is made of postgres alone and needs no backup: one lost or deleted is made again by the next write and filled by the next reconcile. The `g1` in its name is its generation, raised when its mapping or the chunks change; the new one fills next to the old, which is then deleted by hand (`curl -X DELETE localhost:9200/unihub-texts-g1-bm25`)

Without `OPENSEARCH_URL` none of this is loaded, and processing runs as it did.

### Canvas

The `canvas` connector (`libs/plugins/canvas`) polls a school's [Canvas LMS](https://canvas.instructure.com/doc/api/) every hour, on the hub owner's own personal access token. It's one account, `shared`: whoever the hub lets read a course reads it as the owner sees it. It isn't in `PLUGINS` by default, and turning it on is the owner's call: the school's Canvas policies come first. Instructure's API policy has the school told when an app hands Canvas content to generative AI (the hub's MCP does) and doesn't let one user's access serve others, so tell the school (its Canvas admins or IT) what the hub reads and who reads it, and until the school or the teachers say otherwise, grant its courses to no one but yourself.

To turn it on:

- in Canvas, Account → Settings → Approved Integrations → New Access Token, with a purpose and an expiry date. Some schools don't let students make tokens or cap how long one lasts, and Canvas has revoked tokens in bulk before: the connector warns in the log 14 days before the token expires, and a run fails with "canvas token expired or was revoked" once Canvas no longer takes it
- set `CANVAS_URL` (the school's Canvas, `https://canvas.example.edu`, https only as the token goes with every request: in `.env` or `deploy/.env`, never in the repo), `CANVAS_TOKEN` and, if you like, `CANVAS_USER_AGENT` (Canvas refuses requests without one; `UniHub canvas connector` by default), then add `canvas` to `PLUGINS`

What it reads, of the courses you're active in:

- the course, by its own name rather than your nickname for it, with its code, term and dates in `meta` (to pick the year by when linking it)
- modules with their items, announcements, pages and assignments (with the dates for everyone, not your own), as items `module:`, `topic:`, `page:` and `assignment:` with the portal's id
- files with their folders' paths, linked to their page in the course; an announcement's attachments name it. Content is downloaded only when the hub asks for it (a new file, or a new size or date), and a file locked for you waits for a later run
- a hidden Pages or Files tab keeps those lists out, but the pages and files the modules link to are read one by one
- only what the whole course sees: no announcements for some sections, no assignments for only some students, no group discussions, and no field that says how you stand (read, done, locked, your submission)
- not discussion replies, quizzes, grades, submissions, the calendar, groups, finished courses, or files linked only from inside a page's text

A record gone from a listing that went through to the end is removed. Nothing is removed for a listing that failed, was cut short or refused, or a tab hidden since. A course Canvas fails on (a listing still failing after the retries, a bad request) is skipped for that run and logged, the others go on, and the run is marked failed once they're through; a download it fails on is logged and tried again the next run. It sends one request at a time, 100 records a page; a throttled or failing request is tried again after 1, 2, 4, 8 and 16 seconds, and each waits 2 seconds while the token's quota is low. That's about ten requests per course an hour, and the files that changed.

## External connectors

A connector can also run as its own service, in any language, and send data over gRPC (`proto/ingest.proto`). Each one gets a token in `CONNECTOR_TOKENS="portal=token,…"` and sends it as `authorization: Bearer <token>`; the token decides the portal. The hub doesn't schedule these, they sync when they want.

A refused call's status says what to do: `INVALID_ARGUMENT` fix the record or skip it, `FAILED_PRECONDITION` send what it refers to first (a course before its posts), `DATA_LOSS` send the content again, `ABORTED` or `UNAVAILABLE` try again later. When the hub refused it, the `grpc-status-details-bin` trailer also has gRPC's standard `google.rpc.Status` with a `google.rpc.ErrorInfo`: `domain` is `unihub` and `reason` a name that never changes, to switch on instead of the message:

- `INVALID_RECORD`: not the shape the proto describes (a Content stream out of order too), or text and json postgres can't keep
- `FILE_COURSE_MISMATCH`: a file names a course, and a post in another one
- `UNKNOWN_REFERENCE`: a course, post or file never sent
- `CONTENT_TOO_LARGE`: content past `STORAGE_MAX_FILE_MB`

Most gRPC libraries decode the trailer themselves: in Go `status.FromError(err)` and `.Details()`, in Java `StatusProto.fromThrowable()`, in Python `rpc_status.from_call()` from `grpcio-status`. In Node, decode it as `google.rpc.Status` with protobufjs and Google's `google/rpc` protos (a copy is in `proto/google/rpc`), as `test/grpc.e2e-spec.ts` does.

The gRPC server starts only when some token is set and listens on `GRPC_URL` without TLS, so keep it on a private network or behind a TLS proxy.

File content, from either kind of connector, is kept once per sha256 under `STORAGE_PATH`. One file may take up to `STORAGE_MAX_FILE_MB` (1024 MiB by default): past that the upload is refused as an invalid record (`INVALID_ARGUMENT` over gRPC) and nothing of it is kept. A file whose declared size is past it is answered `needsContent: false`, so a connector doesn't send it on every sync; one without a size should not resend refused content until `File` answers `changed` for it.

## Deploy

`deploy/compose.yml` runs the hub on one server: caddy (TLS from Let's Encrypt) in front of the app, postgres and redis.

```bash
cp deploy/.env.example deploy/.env   # then fill it in
docker compose -f deploy/compose.yml up -d --build
# the first admin, with the build image's tools
docker compose -f deploy/compose.yml run --rm migrate npm run auth:create-admin -- --email you@example.com --password '…'
```

- the `migrate` service applies prisma's and the outbox's migrations before the app starts
- `/api/health` checks the database and redis; compose waits for it
- external connectors reach gRPC through caddy over TLS on the same address (`DOMAIN:443`); the gRPC port isn't published
- logs are capped per container
- give the domain an A record only (or turn on IPv6 in docker): docker forwards IPv6 through its proxy, and every IPv6 client would show up with one address
- backups: `deploy/backup.sh <folder>` from cron dumps the database and copies new files; keep the folder, and `deploy/.env`, off the server too

Restoring, into an empty stack with the same `deploy/.env`:

```bash
docker compose -f deploy/compose.yml up -d postgres
docker compose -f deploy/compose.yml exec -T postgres pg_restore -U unihub -d unihub --no-owner < backups/db-<date>.dump
docker compose -f deploy/compose.yml create app   # makes the blobs volume
rsync -a backups/blobs/ "$(docker volume inspect -f '{{ .Mountpoint }}' unihub_blobs)/blobs/"
chown -R 1000:1000 "$(docker volume inspect -f '{{ .Mountpoint }}' unihub_blobs)"
docker compose -f deploy/compose.yml up -d
```

Updating: back up, `git pull`, then `up -d --build` again. The old app keeps running while `migrate` applies the new schema, so a migration only adds until the code that needed the old shape is gone; going back past a migration means restoring a backup.
