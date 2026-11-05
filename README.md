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

Search by meaning needs an embedding model: `docker compose --profile models up -d` adds a [TEI](https://github.com/huggingface/text-embeddings-inference) server with `BAAI/bge-m3` (2.3 GB, downloaded once into the `models` volume; about 2.4 GB of memory), and the `EMBEDDING_*` lines in `.env.example` point the app at it (`TEI_TAG` picks the image for your arch). The profile also starts a reranker, `bge-reranker-v2-m3` quantized to int8 (0.6 GB, put into the volume once by `reranker-init`; about 2 GB of memory), which `RERANK_URL` points at. Both models at once take about 4.5 GB, tight beside OpenSearch on a machine with 8 GB for Docker: leave `RERANK_URL` empty and start only `embedder` (`docker compose --profile models up -d embedder`). To try the wiring on a small machine, a small English embedder does: `EMBED_MODEL_ID=sentence-transformers/all-MiniLM-L6-v2`, `EMBED_REVISION=1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, `EMBEDDING_MODEL=all-minilm-l6-v2-1110a243`, `EMBEDDING_DIMENSIONS=384`.

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
- e2e specs (`test/*.e2e-spec.ts`) check only what fakes can't: how records are written and read back, what the read queries find and in what order, the locks, the outbox rolling back with its transaction, BullMQ's deduplication, gRPC, each route and MCP tool once (and one bad request to each that declares a schema, since nothing else sees it is attached), the whole pipeline once (`plugins.e2e-spec.ts`), the search index's writes and their repair (`search-index.e2e-spec.ts`), what OpenSearch answers a search, by the words and by meaning, and what of it the reranker gets (`search.e2e-spec.ts`), who finds what through the search route and tool, and their shared limit (`search-api.e2e-spec.ts`), the app with search off (`search-off.e2e-spec.ts`), and the text index's analyzers, whose rules live in OpenSearch (`search-analysis.e2e-spec.ts`: a word in Cyrillic, in Latin and without diacritics gives the same tokens, on the OpenSearch client alone). The others boot the app as `main.ts` sets it up (`bootApp()` in `test/app.ts`) on a database, redis db, folder and search indices (`unihub-e2e-*`) of their own (`test/env.ts`), made anew for every run, with `FakeEmbedder` and `FakeReranker` (`test/fake-models.ts`) for the models, so none is downloaded (the reranker busy, so the order they check is the index's, unless a spec gives it scores), and wait for what they wait on (the outbox's events, a job's state), never for a while

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
- `GET /api/search?q=semafor&course=os&limit=10`: the files of their courses (or of the one named) whose text matches, best first (Search, below)

Everything goes through `CourseReader` and `CourseSearch` (`src/access`), which MCP shares; 1200 calls a minute per user, and searches apart, 20 a minute.

Admins set the courses up (`@Roles([ADMIN_ROLE])`):

- `POST /api/courses` with `{ slug, name }`: a course
- `PUT /api/portal-courses/{portal}/{externalId}/course` with `{ course, year }`: the portal course becomes part of that course (no `year` for one that spans years); one linked elsewhere moves
- `DELETE /api/portal-courses/{portal}/{externalId}/course`: unlinks it
- `PUT /api/users/{userId}/courses/{courseId}`: the user reads the course, named by the id `POST /api/courses` answered (users' ids from Better Auth's `GET /api/auth/admin/list-users`); `DELETE` on the same path takes it back. An id no user has is a 404, and so is granting one no course has

### Search

`q` is 2 to 500 characters: words, a phrase or a code identifier, in Latin or Cyrillic, with or without diacritics; `limit` is 1 to 50 files, 10 by default. The answer:

```json
{ "results": [ {
    "fileId": "3f0c…", "name": "l5.pdf", "path": "Predavanja", "course": "os",
    "pages": [ { "page": 3, "processor": "office-text",
                 "snippet": { "text": "…", "highlights": [[12, 18]] } } ],
    "sameContentIn": ["9a1e…"] } ] }
```

- a file per content, the first by folder and name of those the user reads; `sameContentIn` names the others with the same bytes
- `pages`: its best pages first, up to 3, each by its best fragment; `GET /api/files/{fileId}/text?page=3&processor=office-text` (MCP: `read_file` with the same `page` and `processor`) reads the whole page, as a file can have a text per processor, each paged on its own
- `snippet.text` is up to 400 characters of the page as indexed (letters composed, NFC), plain text with whatever HTML the file had: show it as text, never as HTML. `highlights` are `[start, end)` UTF-16 offsets into that text only (a page read whole may differ, when the file's letters weren't composed)
- with an embedder (Search index, below), a file is found by meaning too: a page about the same thing in other words, or in another language. Then a search answers up to `limit` files even when none has the words, the nearest by meaning, as knn always has nearest ones; `highlights` mark only the words found
- with a reranker (Search index, below), the best files (20 by default) come in the order it puts them, by how well their best snippet answers `q`; while it's busy with another search, or away, in the index's order
- only the files the user reads right now are looked through, so a grant taken back or a file removed counts from the next search on. A course they don't read is a 404, as on the other routes; the search index away is a 503 (`SEARCH_UNAVAILABLE`)
- with no `OPENSEARCH_URL` there's no search: the route is a 404 and the tool isn't listed
- 20 searches a minute per user, REST and MCP counted together (`X-RateLimit-*-search`)

## MCP

`/api/mcp` serves the same reads to AI clients over streamable HTTP, as the tools `list_courses`, `list_items`, `list_files`, `read_file` (page by page, of the processor named or the first one) and `search` (as `GET /api/search`, its results as JSON; over its limit, a tool error). A client signs in with an API key (create one at `POST /api/auth/api-key/create`), sent as `X-API-Key` or `Authorization: Bearer`; 600 calls a minute per user, however many keys they have. A request carries one JSON-RPC message as JSON: other bodies get 415, batches 400.

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

With `OPENSEARCH_URL` set, the texts also go into an OpenSearch index, its analyzers taking a word in Cyrillic, in Latin and without diacritics alike. With an embedder (`EMBEDDING_URL`, a TEI server), each chunk goes in with its vector too, in `<OPENSEARCH_INDEX_PREFIX>-texts-g1-<EMBEDDING_MODEL>-<EMBEDDING_DIMENSIONS>`; without one, by the words alone, in `<OPENSEARCH_INDEX_PREFIX>-texts-g1-bm25`:

- each page is cut into chunks of up to 1200 characters, at a paragraph, line or word break, its letters composed (NFC), and embedded 8 at a time
- a `search-index` queue, one job at a time, writes the newest version of each text the processors store: its chunks, then a manifest that says the text is in whole, then it drops its other versions, a newer one postgres lost too. While OpenSearch, the embedder or the database is away (an embedder refusing connections, hanging up or not found, or answering 429, 502, 503 or 504), or OpenSearch's disk is past its flood stage, the queue waits 30 s at a time without spending attempts, and logs it as an error every 10 minutes it goes on. On shutdown the text being embedded is let go of at once and goes back to wait, also without spending an attempt, so a restart doesn't wait out a long one
- the embedder is asked its model (`/info`) before its first embed: `EMBEDDING_MODEL` names the model and its revision as it serves them (`bge-m3-5617a9f6` for `BAAI/bge-m3` at `5617a9f6…`), and a server of another one fails every embed, saying which, so vectors of two models never mix in one index. Another model is another `EMBEDDING_MODEL`, so another index, filled from postgres next to the old one; a vector of other than `EMBEDDING_DIMENSIONS` fails too
- a reconcile at startup (tried again every 30 s while OpenSearch is still starting, for 10 minutes) and every hour queues what the index lacks and what it still holds of other versions or removed texts
- `SearchTextsQuery(text, hashes, limit)` (processing's contracts) looks through the contents it's given, and no others: the index knows nothing of who reads what (access's `CourseSearch` gives it the contents of the files the user reads). It answers those whose texts have the words in any analysis (exact forms, Serbian and English stems, code identifiers) and, with an embedder, those whose chunks are nearest the query's meaning: a hybrid query of the two, the contents' filter on both, each part's scores made 0 to 1 and then averaged, a half each (the `<OPENSEARCH_INDEX_PREFIX>-hybrid` search pipeline, put whenever the index is made sure of). The query's vector comes from `EMBEDDING_QUERY_URL`, a server of its own with the same model so a search never waits behind indexing (`EMBEDDING_URL` unless it's set), within 3 s; past that, while it's away or when it serves another model, the search goes by the words alone and the log says why. Best first, at most `limit`, each with its best pages (up to 3, each once, by the best of its chunks there) and a snippet of up to 400 characters. `highlights` are UTF-16 offsets into the snippet's own text, which comes from the page as indexed (NFC), plain text with whatever HTML the source had, to be shown as text. OpenSearch away, or a search past 5 s, is `SEARCH_UNAVAILABLE` (503); one that finds the index or the pipeline gone makes them again, and finds nothing until the reconcile fills the index
- with a reranker (`RERANK_URL`, a TEI server of a model that reads the query and a text together, as `bge-reranker-v2-m3`), the index is asked for at least `RERANK_CANDIDATES` contents (20 by default, up to 50), and those come in the order it scores them, each by its best snippet, ties as the index had them and the rest after. On a CPU it's slow (20 snippets take about 1.3 s on 6 arm cores), so it takes one search at a time: another meanwhile keeps the index's order at once, and so does one past 5 s or while it's away, with a warning in the log, or one it fails otherwise (another kind of model at `RERANK_URL`, an answer that can't be read), with an error
- the index is made of postgres alone and needs no backup: one lost or deleted is made again (with the pipeline) by the next write and filled by the next reconcile. The `g1` in its name is its generation, raised when its mapping or the chunks change; the new one, or one of another model (`EMBEDDING_URL` set for the first time too), fills next to the old, which is then deleted by hand (`curl -X DELETE localhost:9200/unihub-texts-g1-bm25`; on a server, Deploying search). Searches go to the new one at once, so until the reconcile has filled it (one text at a time, each embedded 8 chunks at a time: hours for a large corpus) they answer only what it holds so far

Without `OPENSEARCH_URL` none of this is loaded, and processing runs as it did; `SearchTextsQuery` answers `SEARCH_OFF` (503).

### Canvas

The `canvas` connector (`libs/plugins/canvas`) polls a school's [Canvas LMS](https://canvas.instructure.com/doc/api/) every hour, on the hub owner's own personal access token. It's one account, `shared`: whoever the hub lets read a course reads it as the owner sees it. It isn't in `PLUGINS` by default, and turning it on is the owner's call: the school's Canvas policies come first. Instructure's API policy has the school told when an app hands Canvas content to generative AI (the hub's MCP does) and doesn't let one user's access serve others, so tell the school (its Canvas admins or IT) what the hub reads and who reads it, and until the school or the teachers say otherwise, grant its courses to no one but yourself.

To turn it on:

- in Canvas, Account → Settings → Approved Integrations → New Access Token, with a purpose and an expiry date. Some schools don't let students make tokens or cap how long one lasts, and Canvas has revoked tokens in bulk before: the connector warns in the log 14 days before the token expires, and a run fails with "canvas token expired or was revoked" once Canvas no longer takes it
- set `CANVAS_URL` (the school's Canvas, `https://canvas.example.edu`, https only as the token goes with every request: in `.env` or `deploy/.env`, never in the repo), `CANVAS_TOKEN` and, if you like, `CANVAS_USER_AGENT` (Canvas refuses requests without one; `course-sync` by default, which names neither the hub nor you), then add `canvas` to `PLUGINS`

What it reads, of the courses you're active in:

- the course, by its own name rather than your nickname for it, with its code, term and dates in `meta` (to pick the year by when linking it)
- modules with their items, announcements, pages and assignments (with the dates for everyone, not your own), as items `module:`, `topic:`, `page:` and `assignment:` with the portal's id
- files with their folders' paths, linked to their page in the course; an announcement's attachments name it. Content is downloaded only when the hub asks for it (a new file, or a new size or date), and a file locked for you waits for a later run
- a hidden Pages or Files tab keeps those lists out, but the pages and files the modules link to are read one by one
- only what the whole course sees: no announcements for some sections, no assignments for only some students, no group discussions, and no field that says how you stand (read, done, locked, your submission)
- not discussion replies, quizzes, grades, submissions, the calendar, groups, finished courses, or files linked only from inside a page's text

A record gone from a listing that went through to the end is removed. Nothing is removed for a listing that failed, was cut short or refused, or a tab hidden since. A course Canvas fails on (a listing still failing after the retries, a bad request) is skipped for that run and logged, the others go on, and the run is marked failed once they're through; a request that gets no answer after the retries (the network, a page that isn't JSON) fails the run there. A download Canvas refuses or fails, one that gets no answer after the retries, and one cut off partway are logged and tried again the next run. It sends one request at a time, 100 records a page; a throttled or failing request, or one the network failed, is tried again after about 1, 2, 4, 8 and 16 seconds; a request has a minute for its answer, redirects included, and then fails once a minute goes by without a byte read (for a download, also when the hub's storage takes none for that long); and each request waits 2 seconds while the token's quota is low. The token goes to the school's Canvas only: a link Canvas gives to another address is refused and fails the run, and a redirect to one leaves the token out. That's about ten requests per course an hour, and the files that changed.

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

`deploy/compose.yml` runs the hub on one server: caddy (TLS from Let's Encrypt) in front of the app, postgres and redis, and with its `search` profile OpenSearch and the models (Deploying search, below).

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
- backups: `deploy/backup.sh <folder>` from cron dumps the database and copies new files; keep the folder, and `deploy/.env`, off the server too. The search index needs none (below)

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

Published images: after CI passes on main, `.github/workflows/release.yml` pushes two images of that commit, tagged with its full sha, to the registry in the repo secret `REGISTRY` (logged in with `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`; without it nothing is published): `unihub/app`, the app, and `unihub/migrate`, the `build` stage the `migrate` service runs. A deployment can pull a version instead of building it, and go back to an older one without a rebuild.

### Deploying search

With the search lines of `deploy/.env.example` uncommented in `deploy/.env` (`COMPOSE_PROFILES="search"` among them, and `TEI_TAG` on an arm64 server), `up -d` also starts OpenSearch, two TEI servers of `BAAI/bge-m3` (`embedder` for indexing, `embedder-query` for searches, so a search never waits behind indexing) and the reranker, whose model `reranker-init` puts in place once. Without them, as in CI's smoke run, there's no search. Only the compose network reaches them: OpenSearch runs without users or TLS and holds the text of every file, so never publish its port, nor the models'. These services extend `docker-compose.yml`'s, where the models and their revisions are pinned once, and drop its ports with `!reset`: the server needs the whole checkout and Docker Compose 2.24 or later. The app waits for none of them (Search index, above, says what it does while one is away). The `curl` commands below run in OpenSearch's container, after `docker compose -f deploy/compose.yml exec opensearch`.

- the host needs `vm.max_map_count` of at least 262144: `sudo sysctl -w vm.max_map_count=262144`, and the line `vm.max_map_count=262144` in `/etc/sysctl.d/99-opensearch.conf` to keep it after a reboot
- memory, by the limits: OpenSearch 4 GB (`OPENSEARCH_MEMORY`), each TEI server 3 GB, so 13 GB for search alone and a server of 16 GB. OpenSearch's heap is 2 GB (`OPENSEARCH_HEAP`), locked in memory so it's never swapped out, and at most half its memory, as Lucene's files and the vectors' graphs take the rest: a larger heap needs a larger `OPENSEARCH_MEMORY` with it. Once the index is filled, `curl -s 'localhost:9200/_nodes/stats/jvm?filter_path=**.heap_used_percent'` shows how much of the heap it takes. The TEI servers take whatever cores are free; `TEI_CPUS` caps each, no more than the server has (docker refuses that)
- disk: the models take 2.9 GB of the `models` volume, downloaded on the first start (bge-m3 2.3 GB, the reranker 0.6 GB). That first `up` waits for `embedder` to download its model before it starts `embedder-query`, which reads the same files: a TEI that finds another downloading them gives up on them and starts on another backend from another copy, its vectors a little off. The index takes about four times the texts, and 4 KB a chunk for its vector: under a GB for 50,000 chunks
- backfill: once search is on, and after each new generation or model (Search index, above), the reconcile queues every text, embedded one at a time, 8 chunks at a time. That's about 2.6 chunks a second on 6 arm cores (not yet measured on amd64), some 4 hours for 40,000 chunks (about 20,000 pages). Searches work meanwhile, by meaning too, but find only what's in so far; it's done once the hourly reconcile no longer logs `queued … search index jobs`
- a disk past OpenSearch's flood stage (95% used) makes the index read-only: searches go on, indexing waits (logged, as an error every 10 minutes), and past 90% (the high watermark) no index is made either. Free space (`docker image prune`, old generations below) until the disk is under 90%, not just under 95%: OpenSearch then lifts the block itself within half a minute, and the queue goes on. `curl -s 'localhost:9200/_cat/allocation?v'` shows the disk as it sees it
- old generations: a new generation or model is a new index, filled next to the old one, which stays until it's deleted by hand once the new one is done. `curl -s 'localhost:9200/_cat/indices/unihub-*?v'` lists them, `curl -s -X DELETE localhost:9200/unihub-texts-g1-bm25` deletes one
- no backup: the index is made of postgres alone, so `backup.sh` leaves out the `osdata` and `models` volumes. Restored onto a new server, or with `osdata` lost, the models are downloaded again and the reconcile fills the index again, as in the backfill above
- a snippet is plain text with whatever HTML its file had (REST API, Search): a web page shows it as text (`textContent`), never as HTML, or a file's markup runs in the page
