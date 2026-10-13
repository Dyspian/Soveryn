# Character progression

Accounts stay in `users`. Each account has one character. Passwords remain scrypt hashes. The client cannot submit a level, experience total, currency balance, or reward amount.

`db/migrations/0003_progression.sql` adds specialization, experience, skill points, currency, reputation, and condition to `characters`. It also adds skill definitions, mission definitions, item definitions, and the player-owned rows for each. The dev server applies pending migrations when it starts.

## Creation

The creation screen has four steps: identity, starting country and city, specialization, and review. The server checks the username, portrait, country, open starting city, specialization, and the confirmation field. A repeated submit cannot create a second character for the same account.

A specialization grants level 1 in its listed skills and does not block later skills. A generalist also starts with one skill point. Every character receives the configured starting currency and one field notebook.

## Rewards

Practice, mission completion, and skill-point spending run in a database transaction for the signed-in account. One-time mission rewards use `mission:<id>`. A repeatable contract uses `mission:<id>:<completion>`, so a retry of the same completion cannot pay twice and a later completion can. Practice is one session for the whole character. `practice_cooldown_seconds` is 86400. The Production skill can shorten that wait by its stored seconds, with a floor of 15 seconds, and it does not open a second session. The next time is stored on `action_cooldowns` as `practice:session`. Skill effects are read from `skill_definitions` when a reward is calculated.

Introductory missions check a stored fact or an inventory item:

- City research compares the answer with the imported population. An unreported population accepts only the word `unreported`.
- The local introduction must name the saved starting city.
- Skill missions complete only after Practice is saved while the mission is active.
- The delivery mission issues one local shipment on accept and removes it when the delivery is saved.
- Level and skill-level contracts complete from the stored character or skill level.
- Work-shift contracts complete when a company shift is saved. The shift still uses the company cooldown and wage rules.

Repeatable contracts are limited to the character's specialization and become available again only after `available_at`. A higher `min_level` stays locked until the stored level reaches it. A journey contract completes when a player journey arrives. A goods shipment does not move the character.

Experience thresholds live in `level_bands`. Each level after the first grants one skill point.

## Focuses

`db/migrations/0015_skill_tree.sql` adds skill focuses. A focus spends an existing skill point. It does not reset skills, and specialization cannot be switched. One choice can be acquired in each specialization. Mastery requires that choice, character level 4, and the listed skill at level 2.

The server applies the stored effect when the related action runs: practice experience, a finance or construction shift fee, a market fee, a recipe operating cost, a goods shipment cost, a passenger journey cost, mission experience, or mission reputation. Each effect has a cap. A locked focus changes nothing. Some focuses also open a contract; accepting it without the focus is rejected. The daily practice cooldown is unchanged.
