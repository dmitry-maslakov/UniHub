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

A plugin is a Nest module that depends only on `@app/plugin-sdk`:

- `@Connector({ portal })` pulls data from a portal when it wants to and sends it through `Ingest.forPortal(portal)`
- `@ContentProcessor({ name, version, accepts })` turns file content into text for models
- `@Aggregator({ name, topics })` reacts to messages (`item.ingested`, `file.content-stored`)

Built-in plugins are listed in `src/plugins/enabled.ts` and turned on by name in `PLUGINS`. `test/fake-plugins.ts` shows one of each.
