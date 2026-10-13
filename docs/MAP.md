# Map

Phase 1 uses **MapLibre GL JS** with the OpenFreeMap dark style:

`https://tiles.openfreemap.org/styles/dark`

CesiumJS was not used. A 3D globe needs a terrain and imagery host, and Cesium ion adds cost and a key. MapLibre covers pan, zoom, rotation, pitch, country selection, clustered city markers, and mobile screens without a tile key. A globe can be reconsidered when the extra weight is justified.

## Licenses

- MapLibre GL JS: BSD 3-Clause
- OpenFreeMap styles: MIT
- Map data: OpenStreetMap, via OpenMapTiles. OpenFreeMap's required attribution is added by MapLibre and must stay visible.
- Printed or video use also needs: OpenFreeMap © OpenMapTiles Data from OpenStreetMap

Country borders drawn on top of the tiles are Natural Earth, not the tile vendor's proprietary data. City markers are GeoNames coordinates.

## Layers

Working layers: country borders, starting cities, other recorded places in the current view (limited to 200), imported resource statistics, game politics, business properties, and organizations. The conflicts control stays disabled. It does not draw warfare or territorial conquest. A city contest, when one is stored, is described in the city inspector. The country inspector also shows an open work bulletin and any enacted game law stored for that country. Neither recolors a country. `/map?country=ISO2` opens that country when the code is stored.

All curated starting cities are loaded as one clustered layer. Clusters stay grouped through zoom level 5, and choosing a cluster zooms in. Choosing a country frames that country. Choosing a city flies to it. Other recorded places load only for the current bounding box, at most 200 at a time.
