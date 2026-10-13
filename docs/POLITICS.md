# Politics

Game constitutions, parties, elections, legislation, and public money are fictional simulation state. They are not descriptions of real governments, and no real officeholder is imported as a player.

A character's starting country is their political residence. Adopting a constitution is allowed only for that country, and only while none exists. Later constitutional changes are versioned in `constitution_changes`.

## Templates

Eight templates are stored in `government_templates` and copied into `government_offices` when a player adopts one:

| Template | Executive | Parliament |
| --- | --- | --- |
| Parliamentary republic | Prime minister, formed by the largest party after a proportional election | 5 game seats |
| Presidential republic | President, first past the post | 5 game seats |
| Semi-presidential republic | President elected; prime minister appointed | 5 game seats |
| Constitutional monarchy | Prime minister governs. The monarch office stays vacant; nothing is invented to fill it | 5 game seats |
| Federal republic | President, plus one national mayor office. Not a mayor for every city | 5 game seats |
| One-party state | General secretary. A second party cannot be founded | 5 game seats |
| Authoritarian state | President. Emergency powers can later block new parties | 5 game seats |
| Dictatorship | Vacant ruler office claimed by a party leader, unless a larger party exists. A larger party can replace them. Emergency powers can then block new parties | None |

Five seats is a game scale. It is not the size of any real legislature.

## Elections

Supported kinds: first past the post, two-round (a majority is required in round one, otherwise the top two continue), proportional parliament by D'Hondt, party leadership, and confidence.

Registration and voting periods come from `game_rules`. The organizer, a party leader, or the executive can advance a period so a test or a live session does not have to wait. Deadlines are still enforced: a ballot is rejected before voting opens and after it closes. One receipt per voter per round is required. National choices are stored in `ballot_choices` without a voter id. Confidence votes are not secret, because the rule records yes or no from sitting members. A tie installs nobody. Speeches cost 5 currency and add a support point used only to order a party list and to break nothing in the public count. They do not add votes.

## Laws and money

A passed bill writes one `policy_versions` row. The world tick counts a bill after `voting_ends`, once. The manual count uses the same settlement. No votes, or a result that does not pass, rejects the bill and writes no policy. A second count does not write another version.

Supported effects, each applied by the existing economy service:

- `sales_tax_percent`, 0 to 25. The next market purchase in that country pays `floor(price * percent / 100)` from the buyer to the government account. With no policy, the market is unchanged.
- `tariff_percent`, 0 to 25. A goods shipment into that country from another country pays this amount instead of `international_tariff`. A shipment inside the country is unchanged.
- `wage_floor`, 1 to 50. A new job posting in that country cannot offer less. Postings that already exist stay as they are.
- `extraction_cost`, 1 to 20. An extraction run charges this amount from the company instead of the site's stored operating cost.

Party and government balances use ledger kinds `party` and `government`. Spending requires `may_spend` on an active office. Paying one's own character opens an investigation and reduces reputation by `scandal_reputation_loss`. It does not create currency.

## Map

The Game politics layer highlights countries that have a game constitution. The color is not a real-world political classification. The country panel names the template and the current game executive, or says that neither exists.
