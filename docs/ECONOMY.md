# Economy

Game money, businesses, stock, production, markets, jobs, and shipments are server-authoritative. Country reserve statistics are a separate reference import. An in-game extraction never updates those statistics.

## Accounts

A character spends `characters.currency`. A business spends `businesses.balance`. Every movement also writes a `ledger_entries` row with a unique idempotency key. The system account is a sink for fees and a source for refunds; it has no stored balance. Transfers lock the character or business row and refuse a negative balance.

## What is simulated

The company owner lists stored goods from the business page. A listing uses the seller's unit price. The city market shows the latest completed sale for a product only when a listing in that city has status sold, and open quantity only from listings that are still open. There is no generated regional price.

Production recipes, extraction capacity, wages, market prices, and shipment time are game rules. Shipment distance is a great-circle estimate between stored city coordinates. It is not a road, sea, or air route, and it does not move the character. Extraction sites start from `extraction_starting_units`, not from the national reserve figure.

A service shift credits `service_shift_revenue` to the company. When `service_skill_bonus_per_level` is set, the worker's matching skill adds that amount per level, capped by `service_skill_bonus_cap`. Trade uses Negotiation, logistics uses Logistics, finance uses Finance, construction uses Management, and hospitality uses Public speaking. Mining, energy, and agriculture do not receive that fee; they extract. Manufacturing collects a finished recipe. Production's operating cost is reduced by `production_cost_reduction_per_level` for each Production level, and it cannot fall below 1. Cancelling a job refunds the amount that was actually charged.

Personal currency movements are listed on the character page from `ledger_entries`. Company and organization balances stay on their own ledgers.

Repeatable contracts can require a completed market sale, a delivered shipment, a collected recipe, or arrival from a player journey. Opening the page does not finish them.

A player journey uses the same base cost, cost per 100 km, and seconds per 100 km as a goods shipment. Distance is the great-circle estimate between stored city coordinates. It is an in-game estimate, not a road, sea, or air itinerary. The goods tariff is not charged. Logistics reduces the currency cost and cannot reduce it below 1. The journey updates the recorded city only after the arrival time. The political home country stays the one chosen at creation. A shipment still moves goods and does not move the character. Regional prices, regional stock, visas, and border closures are not implemented. A recorded diplomatic sanction between the two countries blocks the journey.

## Reference data

`npm run db:resources` downloads the Our World in Data extracts of the Energy Institute Statistical Review of World Energy (2025) for proved oil and gas reserves, keeps the latest year for each country already in the database, and stores the amount, unit, year, source, and quality. The same command stores country mine-production totals for coal, iron ore, copper, gold, bauxite, lithium, cobalt, and uranium, plus FAO wheat production via Our World in Data. Those rows use metric `production`. A source zero is stored as zero. A blank value is skipped. A series that does not download is skipped rather than filled with zeros. Timber is not imported. No coordinates are written. Production figures do not open an extraction site; a site still requires a positive proved-reserve row.

The map can highlight countries that have a positive proved reserve. It does not draw deposit pins.
