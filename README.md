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
