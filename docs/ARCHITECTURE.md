# Architecture

The app is a Next.js monolith. Server actions and route handlers read and write PostgreSQL. The browser never chooses a city that the database has not accepted.

Without `DATABASE_URL`, data lives in embedded PostgreSQL (`@electric-sql/pglite`) under `data/pglite`. With `DATABASE_URL`, the same SQL runs through `postgres.js`. Migrations are in `db/migrations`. `0002_postgis.sql` runs only when `CREATE EXTENSION postgis` succeeds.

## Separation

| Data | Mutability |
| --- | --- |
| Countries, places, boundaries, source tokens | Reference data from import |
| Starting-location status and capacity | Game rules, editable by an admin |
| City game-design notes | Balance data, not a geographic fact |
| Resource statistics | Country reference data from import. Game extraction does not change them |
| Businesses, ledger, stock, markets, jobs, shipments | Player and company state |
| Constitutions, parties, elections, laws, government accounts | Fictional political state. Not a real government record |
| Organizations, treasuries, operations | Fictional player groups. Not real institutions |
| World jobs, simulation ticks, and work bulletins | Durable work records. Real UTC timestamps. A bulletin pays once for a company shift |
| Users, sessions, characters | Player state |

A character stores `country_id` and `place_id`. A trigger rejects a place from another country, a place that is not an open starting location, and a city that has reached its capacity. Coordinates are not updated when a character is created.

## Authority

Passwords are hashed with scrypt. Sessions are random tokens stored as SHA-256 hashes in http-only cookies. `getCurrentUser()` loads the role from the users table. Admin actions check that role on the server. `ADMIN_EMAILS` can promote an account at sign-in; the client cannot send a role.

Registration and sign-in are rate limited in the database. Registration stores acceptance of the terms notice. Closing an account replaces the email, removes the password, and deletes sessions. Character, ledger, and vote rows stay.

`ensureDatabase()` applies migrations and starts one in-process world tick. `GET /api/health` reports database connectivity and the last tick time. In production, startup requires `SESSION_SECRET` of at least 32 characters. A civic term is one row per character per UTC week. Character connections are stored as one row per pair. Reputation is the existing character column. `feature_warfare` stays at 0. There is no warfare action to enable. A city contest changes an organization's stored influence score after both treasuries pay a stake. It does not transfer a city or a country.

## Spatial queries

Viewport queries filter latitude and longitude. That is the spatial layer used by the running game. PostGIS geometry is added on servers that have the extension, for later distance and intersection work.
