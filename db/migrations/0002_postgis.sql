-- Optional. Applied only when CREATE EXTENSION postgis succeeds.
-- Phase 1 queries use latitude, longitude, and GeoJSON so the game still runs
-- on PostgreSQL builds that do not ship PostGIS.

create extension if not exists postgis;

alter table places add column if not exists geom geometry(Point, 4326);
alter table countries add column if not exists boundary geometry(MultiPolygon, 4326);

update places
set geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
where geom is null;

update countries
set boundary = ST_Multi(
  ST_CollectionExtract(
    ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(boundary_geojson), 4326)),
    3
  )
)
where boundary is null
  and boundary_geojson is not null;

create index if not exists places_geom_gix on places using gist (geom);
create index if not exists countries_boundary_gix on countries using gist (boundary);
