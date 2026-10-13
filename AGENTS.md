# SOVERYN agent instructions

Phase 1 is the geographic foundation: authentication, one character, imported countries and cities, and a saved starting location. Do not invent populations, coordinates, reserves, or government structures.

## Data

- Import facts through `scripts/import-geography.ts`.
- Keep reference columns separate from character state and from `city_game_attributes`.
- If a source value is missing or unusable, store that quality status. Do not substitute zero.
- Changing starting-city counts belongs in `data/launch-countries.ts`, followed by a re-import.

## Authority

- Validate country and city selection on the server. The database trigger is the last check.
- Do not trust a role sent by the client.
- Do not expose `DATABASE_URL` or session secrets to the browser.

## Maps

- Keep OpenFreeMap attribution visible.
- Disabled layers must not draw placeholder gameplay.

## Checks

Run `npm test` and `npm run typecheck` after changing selection rules, the schema, or character creation.

## Later phases

Skills, missions, experience, inventory, businesses, markets, jobs, resource reference data, the game political simulation, and player organizations are implemented and must stay server-validated. Do not invent reserve figures, deposit coordinates, real officeholders, or real government structures. Game constitutions are player-chosen templates. Warfare and territorial conquest are not implemented.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
