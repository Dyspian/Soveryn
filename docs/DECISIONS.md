# Decisions

## D1 — MapLibre instead of Cesium

Phase 1 needs a selectable world map on desktop and mobile without a tile account. MapLibre and OpenFreeMap provide that. Cesium remains an option if a true globe becomes necessary.

## D2 — Embedded PostgreSQL by default

This environment has no Docker daemon. The app runs on PGlite so the loop can be verified locally. `DATABASE_URL` switches to an external PostgreSQL server, including the PostGIS compose file.

## D3 — PostGIS is optional in Phase 1

Viewport filters use latitude and longitude. `0002_postgis.sql` builds geometry when the extension exists. Queries do not depend on it yet.

## D4 — Source zero is not a population

GeoNames population `0` is stored as unreported and excluded from population ranking. The raw token remains on the row.

## D5 — Nationality is the starting country

Phase 1 has no separate citizenship system. The character's country is the country of the chosen starting city.

## D6 — One character, fixed start

A second character is rejected by a unique account constraint. The starting place cannot be edited from the profile form.

## D7 — Game notes are not facts

Only the profiles in `data/game-design-profiles.json` attach gameplay numbers, and the interface calls them game-design concepts.
