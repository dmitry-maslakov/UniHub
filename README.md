# UniHub

Server that pulls study materials, announcements and deadlines from FTN systems (Canvas, ACS, Teams…) into one place.

## Running locally

Needs Node 22+ and Docker.

```bash
cp .env.example .env   # then set BETTER_AUTH_SECRET
docker compose up -d
npm install
npx prisma migrate dev
npm run start:dev
```

## Layout

- `src/` — the hub: its modules (`catalog`, `ingest`, `storage`, `processing`, `plugins`, `identity`, `access`), each used by the others only through its `contracts.ts`
- `src/platform/` — what the modules run on: `database` (Prisma, `@Transactional()`), `redis`, `queues` (BullMQ), `messaging` (the outbox; `AppModule` names its transports), `errors` (one answer per kind of domain error); `app.module.ts` lists the modules and wires them into the platform
- `libs/plugin-sdk` — everything a plugin may depend on, plugins never import the core directly
- `libs/kernel` — what the hub's modules and the sdk share: values that hold the same rules everywhere (`ContentHash`, `MediaType`, `PortalId`, `PluginName`, `Json`) and the kinds of domain error (not found, conflict, invalid)
- `prisma/schema/` — one schema file per module

## Users

[Better Auth](https://better-auth.com) serves `/api/auth/*`:

- email and password, the email confirmed by a link in a mail (without `SMTP_URL` mails only go to the log)
- Google, when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- sign-in by QR code: a new screen asks for a code (device authorization), a signed-in phone approves it
- session tokens as `Authorization: Bearer`, and API keys for MCP clients: they expire after 90 days, and a new password (a reset, a change, or one an admin sets) deletes them

The first admin: `npm run auth:create-admin -- --email you@example.com --password '…'`. After adding a Better Auth plugin, `npm run auth:generate` updates `prisma/schema/identity.prisma`.

Every HTTP route needs a signed-in user unless it says `@AllowAnonymous()`. Admins read every course, other users the ones granted to them (`GrantCourseAccessCommand`).

## REST API

OpenAPI at `/api/docs`. A signed-in user reads the courses they were given:

- `GET /api/courses`, then `/api/courses/{slug}/items` and `/files` (`offset`, `limit`)
- `GET /api/files/{id}`: the file and the texts made from it
- `GET /api/files/{id}/text?page=2`: one page, slide or section of a text
- `GET /api/files/{id}/content`: the file itself

Everything goes through `CourseReader` (`src/access`), which MCP shares.

Admins set the courses up (`@Roles([ADMIN_ROLE])`):

- `POST /api/courses` with `{ slug, name }`: a course
- `PUT /api/portal-courses/{portal}/{externalId}/course` with `{ course, year }`: the portal course becomes part of that course (no `year` for one that spans years); one linked elsewhere moves
- `DELETE /api/portal-courses/{portal}/{externalId}/course`: unlinks it

## MCP

`/api/mcp` serves the same reads to AI clients over streamable HTTP, as the tools `list_courses`, `list_items`, `list_files` and `read_file` (page by page). A client signs in with an API key (create one at `POST /api/auth/api-key/create`), sent as `X-API-Key` or `Authorization: Bearer`; 600 calls a minute per user, however many keys they have. A request carries one JSON-RPC message as JSON: other bodies get 415, batches 400.

## Plugins

A plugin is a Nest module that depends only on `@app/plugin-sdk` (a lint rule checks it):

- `@PollConnector({ portal, schedule })` — the hub calls `poll(ctx)` on the cron schedule, one run per account at a time
- `@PushConnector({ portal })` — keeps its own connection; the hub calls `start(ctx)` / `stop()`, only on the instance with `RUN_CONNECTORS=true`
- either way data goes in only through `ctx.ingest`, bound to the connector's portal and account
- `@ContentProcessor({ name, version, accepts })` turns file content into text for models
- `@Aggregator({ name, topics })` reacts to messages (`item.ingested`, `item.removed`, `file.content-stored`, `file.removed`) and reads the rest through `HubReader`

Built-in: `office-text` (`libs/plugins/office-text`) turns pdf, pptx, docx, odt and odp into text, one part per page, slide or section. Results are stored per content hash and processor version, and a daily reconcile queues whatever is missing.

Every plugin gets its own queue job per message, so one failing plugin only retries itself. Built-in plugins are listed in `src/plugins/enabled.ts` and turned on by name in `PLUGINS`; `test/fake-plugins.ts` shows one of each.

## External connectors

A connector can also run as its own service, in any language, and send data over gRPC (`proto/ingest.proto`). Each one gets a token in `CONNECTOR_TOKENS="portal=token,…"` and sends it as `authorization: Bearer <token>`; the token decides the portal. The hub doesn't schedule these, they sync when they want.

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
