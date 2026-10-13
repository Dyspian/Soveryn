# Roadmap

## Phase 1 — Playable foundation

Accounts, one character, 30 imported countries, GeoNames places, about 300–500 starting cities, search, a MapLibre world map, and a saved starting location.

Done when a player can register, create a character, explore the map, choose a valid city, reload, and see the same character and location.

## Phase 2 — Core progression

Skills, experience, introductory missions, inventory, businesses, jobs, wages, and player organizations are in place.

## Phase 3 — Economy and resources

Country oil and gas proved reserves can be imported and shown on the map. Mine production for coal, iron ore, copper, gold, bauxite, lithium, cobalt, and uranium, plus wheat production, can be imported as reference totals. Timber is not loaded. Extraction, factory production, markets, and shipments are a separate simulation. Real-world statistics are not used as live output.

## Phase 4 — Politics

Player-chosen government templates, parties, elections, cabinet permissions, a sales-tax law, government spending on the shared ledger, and a diplomacy record. See `docs/POLITICS.md`. Real officeholders are not imported.

## Phase 5 — World expansion

More places, more sources, logistics, conflict, and performance work.

## Known limits

- One character per account. The political home country stays the one chosen at creation. A journey to another open starting city changes the recorded city only after its arrival time.
- Skill practice is one server-timed session about 24 hours after the previous session. Each specialization can spend skill points on one focus and a later mastery contract. Missions include introductions, specialization contracts, a level 4 work contract, and an explorer arrival contract. Regional prices, regional stock, and visas are not implemented. Specialization cannot be switched.
- Avatar upload is not available. Portraits are the six built-in marks.
- Player organizations, underground markets, and abstract criminal operations are implemented. Mine production and wheat production can be imported as reference totals. Timber is not imported. A production row does not open an extraction site.
- Payroll runs when an owner uses the payroll action. It is idempotent per employee per UTC day. A world tick inside the server process also completes due production, shipments, deliveries, listings, and operations, counts an election after its voting deadline, counts a due bill once, and opens or closes work bulletins. The manual bill count uses the same result. A work bulletin is a 24-hour country contract for residents. One company shift pays its stored reward once. While it is open, the mission board lists a matching contract that pays nothing extra. Missed windows are closed, not replayed, and an accepted bulletin contract that was not finished is removed. A company owner lists stored goods from that business at the company's city. The market shows the last completed sale in that city when a sold listing exists, and open quantity from listings that are still open. The map inspector shows the selected country's open work bulletin and enacted game laws. Regional prices, regional demand, and autonomous market makers are not implemented.
- A joint shift is an organization contract. Two members each record one company shift worked during its open window. The treasury receives the existing stake and margin once, and each recorded member receives 1 reputation. Fewer than two recorded shifts closes it without returning the stake. The other organization contracts stay abstract server results.
- A civic term is the UTC week from Monday 00:00 to the next Monday. One mission completion in that week pays 1 reputation once. A missed week is stored and is not replayed. Currency, level, and inventory stay unchanged. There is no battle pass and no daily login reward.
- A connection is one mutual request between two characters. It can be accepted, declined, removed, or blocked. It does not change character reputation. Reputation stays the existing character score from mission rewards and scandals. The public record lists public organization membership, completed mission names, and server-written progression lines. Private organizations, introduction notes, and direct messages are not published. There is no follower list and no popularity ranking.
- Warfare is not implemented. The conflicts map layer stays off. A rivalry can open a city presence contest. Both organization treasuries pay the stake when it is accepted, members record support once, and the world tick resolves it from that support plus the stored influence score. The winner's influence rises. The city and the country are not transferred.
- There is no automated database backup. Stop the server and copy `data/pglite` before a restore when using the embedded database.
- No PostGIS requirement at runtime. The optional migration is ready.
- No government dataset. Constitutions are game templates. Oil and gas reserves are country totals only.
- Parliament has five game seats. The monarch office stays vacant. Local city offices are not stored. There is no warfare system.
- No external error tracker. Failures are returned to the player and written to the server log.
- The embedded database is single-process. Do not run import while the dev server is open.
