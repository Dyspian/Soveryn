# Data sources

Geographic facts in SOVERYN come from imported files. The import fails if a launch country or its boundary is missing. It does not fill gaps with guessed coordinates, populations, or borders.

## GeoNames

- Files: `cities15000.zip` and `countryInfo.txt`
- URL: https://download.geonames.org/export/dump/
- License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
- Attribution: GeoNames, https://www.geonames.org/

`cities15000` supplies place names, alternate names, coordinates, feature codes, admin codes, population tokens, elevation when present, time zone, and the source modification date. `countryInfo.txt` supplies country names, ISO codes, capital names, area, and country population tokens.

A blank population token is stored as unreported. A token of `0` is also unreported for display and ranking, and the original token is kept in `population_source_token` with quality `population_source_zero`. GeoNames does not provide a census year in these files, so no year is invented. Alternate names longer than 8,000 characters are truncated and flagged.

The broader place table includes every `cities15000` record in the 30 launch countries, not only starting cities.

## Natural Earth

- File: `ne_50m_admin_0_countries.geojson`
- URL: https://github.com/nvkelso/natural-earth-vector
- Project terms: public domain, https://www.naturalearthdata.com/about/terms-of-use/
- Attribution: Made with Natural Earth.

Boundaries are stored as GeoJSON. The import does not simplify them. If PostGIS is available, a later migration can build geometry from that GeoJSON.

## Energy Institute, via Our World in Data

`npm run db:resources` downloads two chart extracts:

- Oil proved reserves: https://ourworldindata.org/grapher/oil-proved-reserves
- Natural gas proved reserves: https://ourworldindata.org/grapher/natural-gas-proved-reserves

Our World in Data's compilation is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The figures come from the Energy Institute Statistical Review of World Energy (2025). That review is free to access and must be cited; it is not marked as public domain. The rows in this project are country totals in cubic meters for the latest year present in the extract (2020 or 2021). The stored publication date is 2025-06-27, the Our World in Data processing date, not a field survey date. A reported zero stays zero. A blank cell is not imported. No field coordinates are stored.

`npm run db:resources` also downloads country production statistics. A series that does not return the expected column is skipped and is not stored as zero.

Mine production, in tonnes, comes from the [Our World in Data minerals explorer](https://ourworldindata.org/explorers/minerals) for coal, iron ore (crude ore), copper, gold, bauxite, lithium, cobalt, and uranium. The compilation is CC BY 4.0. These rows use metric `production`. They are not proved reserves and do not open an extraction site.

Wheat production, in tonnes, comes from the [Our World in Data wheat production chart](https://ourworldindata.org/grapher/wheat-production), cited to the Food and Agriculture Organization of the United Nations (2025). It is also metric `production`.

Timber has no confirmed country production chart on that explorer. An unrecognized mineral name on the explorer returns the copper series, so timber is not requested. USGS Mineral Commodity Summaries 2025 remains unloaded: the world-production zip requires a browser check and returned HTTP 403 from this machine. Blank cells are skipped. A source zero stays zero. No field coordinates are stored.

## What is not imported

Government type and election rules are not loaded. A player may adopt one of eight game templates for their starting country. Those templates are configuration, not sourced institutional data. Game-design notes in `data/game-design-profiles.json` are balance concepts for a few cities and are labeled as such. They are matched to imported places by country code and ASCII name. A note that does not match exactly one place is skipped.

## Starting cities

`data/launch-countries.ts` sets the target count per country. The importer keeps a GeoNames capital when one exists. Most of the remaining slots follow reported population, skipping a place within 15 km of a city already chosen. About a quarter of the slots then go to large places farther from that set. It does not add cities that are absent from the extract. The configured total is 468, inside the 300–500 launch range. Administrators can later mark a starting city disabled, full, restricted, or event-only, and can set a capacity. An empty capacity means more than one player may start there. Re-importing updates the curated list and does not reset a status or capacity an administrator has already changed.
