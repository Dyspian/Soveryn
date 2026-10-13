# SOVERYN

SOVERYN is a persistent multiplayer sandbox: one character, a sourced world map, missions, businesses, a market, fictional politics, and player organizations. Warfare is not implemented.

## Run locally

Node.js 20 or newer is required. Docker is optional. Without `DATABASE_URL`, the app uses an embedded PostgreSQL database in `data/pglite`.

```bash
npm install
npm run db:import
npm run dev
```

Open http://localhost:3000, register, create a character, choose a country and starting city, then reload the dashboard. The same character and city should still be there.

`npm run db:import` downloads GeoNames and Natural Earth into `data/cache`, applies migrations, and loads the launch set. Run it again after changing `data/launch-countries.ts` or `data/game-design-profiles.json`. Stop the dev server first so the embedded database is not open in two processes.

To use an external PostgreSQL server instead:

```bash
docker compose up -d
copy .env.example .env
npm run db:setup
```

`docker compose` expects the PostGIS image. The second migration adds geometry columns only when PostGIS is installed. Phase 1 queries use latitude, longitude, and GeoJSON either way.

Copy `.env.example` to `.env` for an external database. `SESSION_SECRET` must be a random string of at least 32 characters before `npm start`. The development server creates a local secret file when that variable is missing. Set `ADMIN_EMAILS` to a comma-separated list. Those accounts can change starting-city status at `/admin/starting-locations` and inspect the world tick at `/admin/world`. The client cannot assign a role.

## Run for use

```bash
npm test
npm run typecheck
npm run build
npm start
```

There is no lint script. Migrations run when the server starts. The same process starts the world tick. `GET /api/health` returns database status and the last tick time, without secrets.

The embedded database has no automated backup. Stop the server, then copy `data/pglite`. Do not run `npm run db:import` while that directory is open. Restoring the copy brings back wallets, inventory, elections, and organization treasuries that were in the file. This repository's live data is development data.

## What the server stores

Character creation saves one character, a portrait, a specialization, and a starting city from the imported geography. Experience, skills, missions, inventory, businesses, markets, jobs, parties, elections, game governments, and player organizations are stored on the server. Resource figures are imported country totals, not invented city deposits. City populations come from GeoNames; a blank value or a source `0` is stored as unreported, with the original token kept. Game constitutions are chosen by players and are not imported government facts.

Registration requires the terms notice at `/legal`. Closing an account retires the login and keeps ledger and political history. The world tick completes due production, shipments, deliveries, listings, and operations, counts an election after its voting deadline, and counts a due bill once. The manual count uses the same bill settlement. `feature_warfare` stays off.

See `docs/POLITICS.md`, `docs/ECONOMY.md`, `docs/PROGRESSION.md`, `docs/DATA_SOURCES.md`, `docs/MAP.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`.
