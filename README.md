# UniHub

Server that pulls study materials, announcements and deadlines from FTN systems (Canvas, ACS, Teams…) into one place.

## Running locally

Needs Node 22+ and Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev
npm run start:dev
```

## Layout

- `src/` — the hub: core modules (`catalog`, `ingest`, `storage`, `processing`)
- `libs/plugin-sdk` — everything a plugin may depend on, plugins never import the core directly
- `prisma/schema/` — one schema file per module

## Plugins

A plugin is a Nest module that depends only on `@app/plugin-sdk` (a lint rule checks it):

- `@Connector({ portal, mode: 'poll', schedule })` — the hub calls `poll(ctx)` on the cron schedule, one run per account at a time
- `@Connector({ portal, mode: 'push' })` — keeps its own connection; the hub calls `start(ctx)` / `stop()`, only on the instance with `RUN_CONNECTORS=true`
- either way data goes in only through `ctx.ingest`, bound to the connector's portal and account
- `@ContentProcessor({ name, version, accepts })` turns file content into text for models
- `@Aggregator({ name, topics })` reacts to messages (`item.ingested`, `item.removed`, `file.content-stored`, `file.removed`) and reads the rest through `HubReader`

Built-in: `office-text` (`libs/plugins/office-text`) turns pdf, pptx, docx, odt and odp into text, one part per page, slide or section. Results are stored per content hash and processor version, and a daily reconcile queues whatever is missing.

Every plugin gets its own queue job per message, so one failing plugin only retries itself. Built-in plugins are listed in `src/plugins/enabled.ts` and turned on by name in `PLUGINS`; `test/fake-plugins.ts` shows one of each.
