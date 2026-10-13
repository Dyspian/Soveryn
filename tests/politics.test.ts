import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { buyListing, foundBusiness, listGoods, postJob } from "@/lib/economy/service";
import { PoliticsError } from "@/lib/politics/errors";
import {
  adoptConstitution,
  advanceElection,
  appointMinister,
  campaignSpeech,
  castVote,
  challengeRuler,
  claimRuledOffice,
  closeBill,
  closeElection,
  createParty,
  formGovernment,
  proposeBill,
  registerCandidate,
  ruleInvestigation,
  scheduleElection,
  signCoalition,
  signTreaty,
  succeedMonarch,
  declareEmergency,
  depositPartyFunds,
  joinParty,
  spendTreasury,
  voteBill,
} from "@/lib/politics/service";
import { provisionNewCharacter } from "@/lib/progression/service";
import { advanceWorld } from "@/lib/world/tick";

const db = new PGlite();

function asSql(queryable: { query: PGlite["query"]; exec: PGlite["exec"] }): Sql {
  return {
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await queryable.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await queryable.exec(text);
    },
  };
}

async function tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return db.transaction(async (transaction) => fn(asSql(transaction)));
}

describe("politics", () => {
  afterAll(async () => {
    await db.close();
  });

  it("elects from ballots, allocates seats, forms a government, and collects a voted tax", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    await db.exec(readFileSync(path.join(directory, "0001_foundation.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0003_progression.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0004_economy.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0005_politics.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0006_politics_gaps.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0015_skill_tree.sql"), "utf8"));

    async function country(iso2: string, iso3: string, name: string) {
      const rows = await db.query<{ id: string }>(
        `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
         values ($1, $2, $3, 'imported', 5, 5, 10) returning id`,
        [iso2, iso3, name],
      );
      return rows.rows[0]?.id ?? "";
    }
    const venezuela = await country("VE", "VEN", "Venezuela");
    const belgium = await country("BE", "BEL", "Belgium");
    const netherlands = await country("NL", "NLD", "Netherlands");

    async function place(geonameId: number, countryId: string, name: string, latitude: number, longitude: number) {
      const rows = await db.query<{ id: string }>(
        `insert into places (geoname_id, country_id, name, ascii_name, latitude, longitude, feature_class, feature_code, population_quality)
         values ($1, $2, $3, $3, $4, $5, 'P', 'PPLC', 'unreported') returning id`,
        [geonameId, countryId, name, latitude, longitude],
      );
      const id = rows.rows[0]?.id ?? "";
      await db.query("insert into starting_locations (place_id, status, selected_by_rule) values ($1, 'open', 'test')", [id]);
      return id;
    }
    const caracas = await place(1, venezuela, "Caracas", 10.5, -66.9);
    const brussels = await place(2, belgium, "Brussels", 50.85, 4.35);
    const amsterdam = await place(3, netherlands, "Amsterdam", 52.37, 4.89);

    let portrait = 0;
    async function person(email: string, username: string, countryId: string, placeId: string) {
      portrait += 1;
      const user = await db.query<{ id: string }>("insert into users (email, password_hash) values ($1, 'hash') returning id", [email]);
      const userId = user.rows[0]?.id ?? "";
      const characterId = await provisionNewCharacter(asSql(db), {
        userId,
        username,
        displayName: null,
        biography: null,
        portraitKey: `mark-${portrait}`,
        countryId,
        placeId,
        specialization: "generalist",
      });
      await db.query("update characters set currency = 800, level = 2, reputation = 20 where id = $1", [characterId]);
      return { userId, characterId };
    }

    const president = await person("president@example.com", "ada_vote", venezuela, caracas);
    const rival = await person("rival@example.com", "rival_vote", venezuela, caracas);
    const late = await person("late@example.com", "late_vote", venezuela, caracas);
    const north = await person("north@example.com", "north_vote", belgium, brussels);
    const northMember = await person("north-member@example.com", "north_member", belgium, brussels);
    const south = await person("south@example.com", "south_vote", belgium, brussels);
    const ruler = await person("ruler@example.com", "ruler_vote", netherlands, amsterdam);
    const challenger = await person("challenger@example.com", "challenge_vote", netherlands, amsterdam);
    const ally = await person("ally@example.com", "ally_vote", netherlands, amsterdam);
    const blocked = await person("blocked@example.com", "blocked_vote", netherlands, amsterdam);

    await tx((sql) => adoptConstitution(sql, { userId: president.userId, countryId: venezuela, templateId: "presidential_republic" }));
    await tx((sql) => adoptConstitution(sql, { userId: north.userId, countryId: belgium, templateId: "parliamentary_republic" }));
    await tx((sql) => adoptConstitution(sql, { userId: ruler.userId, countryId: netherlands, templateId: "dictatorship" }));
    const offices = await db.query<{ country: string; name: string }>(
      `select c.iso2 as country, o.name from government_offices o
       join constitutions k on k.id = o.constitution_id
       join countries c on c.id = k.country_id
       order by c.iso2, o.name`,
    );
    const names = (iso2: string) => offices.rows.filter((row) => row.country === iso2).map((row) => row.name);
    expect(names("VE")).toContain("President");
    expect(names("BE")).toContain("Prime minister");
    expect(names("BE")).not.toContain("President");
    expect(names("NL")).toEqual(["Ruler"]);
    const holders = await db.query<{ count: number }>("select count(*)::int as count from officeholders");
    expect(holders.rows[0]?.count).toBe(0);

    const civic = await tx((sql) => createParty(sql, { userId: president.userId, name: "Civic List", abbreviation: "CL", platform: "A game platform." }));
    await expect(tx((sql) => createParty(sql, { userId: rival.userId, name: "Civic List", abbreviation: "CX", platform: "Same name." }))).rejects.toThrow(/already uses that name/);
    await tx((sql) => joinParty(sql, { userId: rival.userId, partyId: civic }));
    await expect(
      tx((sql) => depositPartyFunds(sql, { userId: rival.userId, amount: 5, idempotencyKey: "44444444-4444-4444-8444-444444444444" })),
    ).rejects.toBeInstanceOf(PoliticsError);

    const election = await tx((sql) => scheduleElection(sql, { userId: president.userId, countryId: venezuela, kind: "fptp_office", officeKey: "president" }));
    await expect(tx((sql) => registerCandidate(sql, { userId: north.userId, electionId: election }))).rejects.toThrow(/another country/);
    await tx((sql) => registerCandidate(sql, { userId: president.userId, electionId: election }));
    await tx((sql) => registerCandidate(sql, { userId: rival.userId, electionId: election }));
    await tx((sql) => advanceElection(sql, { userId: president.userId, electionId: election }));
    await expect(tx((sql) => closeElection(sql, { userId: president.userId, electionId: election }))).rejects.toThrow(/still open/);
    await expect(tx((sql) => castVote(sql, { userId: north.userId, electionId: election, choiceKind: "character", choiceId: president.characterId }))).rejects.toThrow(/not eligible/);
    await tx((sql) => castVote(sql, { userId: president.userId, electionId: election, choiceKind: "character", choiceId: president.characterId }));
    await tx((sql) => castVote(sql, { userId: rival.userId, electionId: election, choiceKind: "character", choiceId: president.characterId }));
    await expect(
      tx((sql) => castVote(sql, { userId: rival.userId, electionId: election, choiceKind: "character", choiceId: rival.characterId })),
    ).rejects.toThrow(/already voted/);
    await tx((sql) => advanceElection(sql, { userId: president.userId, electionId: election }));
    await expect(tx((sql) => castVote(sql, { userId: late.userId, electionId: election, choiceKind: "character", choiceId: president.characterId }))).rejects.toThrow(/not open/);
    expect(await tx((sql) => closeElection(sql, { userId: president.userId, electionId: election }))).toBe("elected");

    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'ballot_choices'",
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("voter_id");
    const ballots = await db.query<{ votes: number }>(
      "select count(*)::int as votes from ballot_choices where election_id = $1 and choice_id = $2",
      [election, president.characterId],
    );
    expect(ballots.rows[0]?.votes).toBe(2);
    const seatedPresident = await db.query<{ username: string }>(
      `select ch.username from officeholders h
       join characters ch on ch.id = h.character_id
       join government_offices o on o.id = h.office_id
       where o.office_key = 'president' and h.status = 'active'`,
    );
    expect(seatedPresident.rows[0]?.username).toBe("ada_vote");
    await expect(
      tx((sql) => spendTreasury(sql, { userId: late.userId, countryId: venezuela, characterId: late.characterId, amount: 1, idempotencyKey: "66666666-6666-4666-8666-666666666666" })),
    ).rejects.toThrow(/not authorized/);
    await expect(tx((sql) => appointMinister(sql, { userId: rival.userId, countryId: venezuela, officeKey: "finance_minister", characterId: rival.characterId }))).rejects.toThrow(/appointment authority/);
    await tx((sql) => appointMinister(sql, { userId: president.userId, countryId: venezuela, officeKey: "finance_minister", characterId: rival.characterId }));

    const bill = await tx((sql) =>
      proposeBill(sql, { userId: president.userId, countryId: venezuela, title: "Game sales tax", body: "Sets the simulated sales tax used by the market.", effectKey: "sales_tax_percent", effectValue: 10 }),
    );
    await tx((sql) => voteBill(sql, { userId: president.userId, billId: bill, vote: "yes" }));
    await db.query("update bills set voting_ends = now() - interval '1 second' where id = $1", [bill]);
    await tx((sql) => closeBill(sql, { userId: president.userId, billId: bill }));
    const policy = await db.query<{ effect_value: number }>("select effect_value from policy_versions where country_id = $1", [venezuela]);
    expect(policy.rows[0]?.effect_value).toBe(10);

    await db.query(
      "insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('character', $1, $2, 'crude_oil', 1)",
      [president.characterId, caracas],
    );
    const listing = await tx((sql) =>
      listGoods(sql, {
        userId: president.userId,
        holderKind: "character",
        holderId: president.characterId,
        placeId: caracas,
        productId: "crude_oil",
        quantity: 1,
        unitPrice: 100,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
      }),
    );
    expect(await tx((sql) => buyListing(sql, { userId: rival.userId, listingId: listing }))).toBe("bought");
    const treasury = await db.query<{ balance: string }>("select balance::text as balance from government_accounts where country_id = $1", [venezuela]);
    expect(treasury.rows[0]?.balance).toBe("10");
    await tx((sql) => spendTreasury(sql, { userId: president.userId, countryId: venezuela, characterId: rival.characterId, amount: 4, idempotencyKey: "77777777-7777-4777-8777-777777777771" }));
    await tx((sql) => spendTreasury(sql, { userId: president.userId, countryId: venezuela, characterId: rival.characterId, amount: 4, idempotencyKey: "77777777-7777-4777-8777-777777777771" }));
    const afterSpend = await db.query<{ balance: string }>("select balance::text as balance from government_accounts where country_id = $1", [venezuela]);
    expect(afterSpend.rows[0]?.balance).toBe("6");
    const ledger = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where reason = 'public_spending' and to_id = $1", [rival.characterId]);
    expect(ledger.rows[0]?.count).toBe(1);
    await tx((sql) => spendTreasury(sql, { userId: president.userId, countryId: venezuela, characterId: president.characterId, amount: 4, idempotencyKey: "77777777-7777-4777-8777-777777777772" }));
    const reputation = await db.query<{ reputation: number }>("select reputation from characters where id = $1", [president.characterId]);
    expect(reputation.rows[0]?.reputation).toBe(10);
    const investigations = await db.query<{ count: number }>("select count(*)::int as count from investigations where subject_character_id = $1", [president.characterId]);
    expect(investigations.rows[0]?.count).toBe(1);
    await tx((sql) => spendTreasury(sql, { userId: president.userId, countryId: venezuela, characterId: president.characterId, amount: 4, idempotencyKey: "77777777-7777-4777-8777-777777777772" }));
    const reputationAfterReplay = await db.query<{ reputation: number }>("select reputation from characters where id = $1", [president.characterId]);
    expect(reputationAfterReplay.rows[0]?.reputation).toBe(10);

    const northern = await tx((sql) => createParty(sql, { userId: north.userId, name: "North List", abbreviation: "NL", platform: "Seats from ballots." }));
    await tx((sql) => joinParty(sql, { userId: northMember.userId, partyId: northern }));
    const southern = await tx((sql) => createParty(sql, { userId: south.userId, name: "South List", abbreviation: "SL", platform: "A smaller list." }));
    const parliament = await tx((sql) => scheduleElection(sql, { userId: north.userId, countryId: belgium, kind: "pr_parliament" }));
    await tx((sql) => registerCandidate(sql, { userId: north.userId, electionId: parliament }));
    await tx((sql) => registerCandidate(sql, { userId: northMember.userId, electionId: parliament }));
    await tx((sql) => registerCandidate(sql, { userId: south.userId, electionId: parliament }));
    await tx((sql) => advanceElection(sql, { userId: north.userId, electionId: parliament }));
    await tx((sql) => castVote(sql, { userId: north.userId, electionId: parliament, choiceKind: "party", choiceId: northern }));
    await tx((sql) => castVote(sql, { userId: northMember.userId, electionId: parliament, choiceKind: "party", choiceId: northern }));
    await tx((sql) => castVote(sql, { userId: south.userId, electionId: parliament, choiceKind: "party", choiceId: southern }));
    await tx((sql) => advanceElection(sql, { userId: north.userId, electionId: parliament }));
    expect(await tx((sql) => closeElection(sql, { userId: north.userId, electionId: parliament }))).toBe("allocated");
    const seats = await db.query<{ name: string; count: number }>(
      `select p.name, count(*)::int as count from parliamentary_seats s
       join parties p on p.id = s.party_id where s.status = 'active' group by p.name order by p.name`,
    );
    expect(seats.rows).toEqual([
      { name: "North List", count: 2 },
      { name: "South List", count: 1 },
    ]);
    await tx((sql) => formGovernment(sql, { userId: north.userId, countryId: belgium }));
    const primeMinister = await db.query<{ username: string }>(
      `select ch.username from officeholders h
       join characters ch on ch.id = h.character_id
       join government_offices o on o.id = h.office_id
       where o.office_key = 'prime_minister' and h.status = 'active'`,
    );
    expect(primeMinister.rows[0]?.username).toBe("north_vote");
    const confidence = await tx((sql) => scheduleElection(sql, { userId: south.userId, countryId: belgium, kind: "confidence" }));
    await tx((sql) => advanceElection(sql, { userId: south.userId, electionId: confidence }));
    await tx((sql) => castVote(sql, { userId: north.userId, electionId: confidence, choiceKind: "yesno", choiceValue: "no" }));
    await tx((sql) => castVote(sql, { userId: northMember.userId, electionId: confidence, choiceKind: "yesno", choiceValue: "no" }));
    await tx((sql) => castVote(sql, { userId: south.userId, electionId: confidence, choiceKind: "yesno", choiceValue: "yes" }));
    await tx((sql) => advanceElection(sql, { userId: south.userId, electionId: confidence }));
    expect(await tx((sql) => closeElection(sql, { userId: south.userId, electionId: confidence }))).toBe("removed");

    const first = await tx((sql) => createParty(sql, { userId: ruler.userId, name: "First Circle", abbreviation: "FC", platform: "Claims the vacant office." }));
    await tx((sql) => claimRuledOffice(sql, { userId: ruler.userId, countryId: netherlands }));
    const second = await tx((sql) => createParty(sql, { userId: challenger.userId, name: "Second Circle", abbreviation: "SC", platform: "A larger party." }));
    await tx((sql) => joinParty(sql, { userId: ally.userId, partyId: second }));
    await tx((sql) => challengeRuler(sql, { userId: challenger.userId, countryId: netherlands }));
    const claimed = await db.query<{ username: string }>(
      `select ch.username from officeholders h
       join characters ch on ch.id = h.character_id
       join government_offices o on o.id = h.office_id
       where o.office_key = 'ruler' and h.status = 'active'`,
    );
    expect(claimed.rows[0]?.username).toBe("challenge_vote");
    await tx((sql) => declareEmergency(sql, { userId: challenger.userId, countryId: netherlands }));
    await expect(tx((sql) => createParty(sql, { userId: blocked.userId, name: "Third Circle", abbreviation: "TC", platform: "Blocked after emergency." }))).rejects.toThrow(/another party/);
    expect(first).toBeTruthy();

    const campaign = await tx((sql) => scheduleElection(sql, { userId: president.userId, countryId: venezuela, kind: "fptp_office", officeKey: "president" }));
    await tx((sql) => registerCandidate(sql, { userId: president.userId, electionId: campaign }));
    await tx((sql) => advanceElection(sql, { userId: president.userId, electionId: campaign }));
    const beforeSpeech = await db.query<{ currency: string }>("select currency::text as currency from characters where id = $1", [president.characterId]);
    expect(await tx((sql) => campaignSpeech(sql, { userId: president.userId, electionId: campaign }))).toBe("recorded");
    expect(await tx((sql) => campaignSpeech(sql, { userId: president.userId, electionId: campaign }))).toBe("replayed");
    const afterSpeech = await db.query<{ currency: string; support: number }>(
      `select ch.currency::text as currency, c.support_points as support
       from characters ch
       join candidates c on c.character_id = ch.id
       where ch.id = $1 and c.election_id = $2`,
      [president.characterId, campaign],
    );
    expect(Number(afterSpeech.rows[0]?.currency)).toBe(Number(beforeSpeech.rows[0]?.currency) - 5);
    expect(afterSpeech.rows[0]?.support).toBe(1);

    const wageBill = await tx((sql) =>
      proposeBill(sql, { userId: president.userId, countryId: venezuela, title: "Game wage floor", body: "Raises the simulated wage floor.", effectKey: "wage_floor", effectValue: 10 }),
    );
    await tx((sql) => voteBill(sql, { userId: president.userId, billId: wageBill, vote: "yes" }));
    await db.query("update bills set voting_ends = now() - interval '1 second' where id = $1", [wageBill]);
    await tx((sql) => closeBill(sql, { userId: president.userId, billId: wageBill }));
    const shop = await tx((sql) =>
      foundBusiness(sql, {
        userId: president.userId,
        name: "Caracas Counter",
        description: "",
        category: "trade",
        placeId: caracas,
        idempotencyKey: "99999999-9999-4999-8999-999999999999",
      }),
    );
    await expect(tx((sql) => postJob(sql, { userId: president.userId, businessId: shop, title: "Counter", wage: 5, skillId: null, minSkillLevel: 0 }))).rejects.toThrow(/wage/);
    expect(await tx((sql) => postJob(sql, { userId: president.userId, businessId: shop, title: "Counter", wage: 10, skillId: null, minSkillLevel: 0 }))).toBeTruthy();
    await tx((sql) => signTreaty(sql, { userId: president.userId, otherCountryId: belgium, title: "Game trade note" }));

    const france = await country("FR", "FRA", "France");
    const paris = await place(4, france, "Paris", 48.86, 2.35);
    const east = await person("east@example.com", "east_vote", france, paris);
    const eastMember = await person("east-member@example.com", "east_member", france, paris);
    const west = await person("west@example.com", "west_vote", france, paris);
    const westMember = await person("west-member@example.com", "west_member", france, paris);
    const center = await person("center@example.com", "center_vote", france, paris);
    await tx((sql) => adoptConstitution(sql, { userId: east.userId, countryId: france, templateId: "constitutional_monarchy" }));
    const eastern = await tx((sql) => createParty(sql, { userId: east.userId, name: "East List", abbreviation: "EL", platform: "A tied list." }));
    await tx((sql) => joinParty(sql, { userId: eastMember.userId, partyId: eastern }));
    const western = await tx((sql) => createParty(sql, { userId: west.userId, name: "West List", abbreviation: "WL", platform: "The other tied list." }));
    await tx((sql) => joinParty(sql, { userId: westMember.userId, partyId: western }));
    const central = await tx((sql) => createParty(sql, { userId: center.userId, name: "Center List", abbreviation: "CE", platform: "The smaller partner." }));
    const frenchParliament = await tx((sql) => scheduleElection(sql, { userId: east.userId, countryId: france, kind: "pr_parliament" }));
    for (const candidate of [east, eastMember, west, westMember, center]) {
      await tx((sql) => registerCandidate(sql, { userId: candidate.userId, electionId: frenchParliament }));
    }
    await tx((sql) => advanceElection(sql, { userId: east.userId, electionId: frenchParliament }));
    await tx((sql) => castVote(sql, { userId: east.userId, electionId: frenchParliament, choiceKind: "party", choiceId: eastern }));
    await tx((sql) => castVote(sql, { userId: eastMember.userId, electionId: frenchParliament, choiceKind: "party", choiceId: eastern }));
    await tx((sql) => castVote(sql, { userId: west.userId, electionId: frenchParliament, choiceKind: "party", choiceId: western }));
    await tx((sql) => castVote(sql, { userId: westMember.userId, electionId: frenchParliament, choiceKind: "party", choiceId: western }));
    await tx((sql) => castVote(sql, { userId: center.userId, electionId: frenchParliament, choiceKind: "party", choiceId: central }));
    await tx((sql) => advanceElection(sql, { userId: east.userId, electionId: frenchParliament }));
    expect(await tx((sql) => closeElection(sql, { userId: east.userId, electionId: frenchParliament }))).toBe("allocated");
    await expect(tx((sql) => formGovernment(sql, { userId: east.userId, countryId: france }))).rejects.toThrow(/tie does not/);
    await tx((sql) => signCoalition(sql, { userId: east.userId, countryId: france, otherPartyId: central }));
    await tx((sql) => formGovernment(sql, { userId: east.userId, countryId: france }));
    await tx((sql) => succeedMonarch(sql, { userId: east.userId, countryId: france, characterId: eastMember.characterId }));
    const monarch = await db.query<{ username: string }>(
      `select ch.username from officeholders h
       join characters ch on ch.id = h.character_id
       join government_offices o on o.id = h.office_id
       join constitutions k on k.id = o.constitution_id
       where k.country_id = $1 and o.office_key = 'monarch' and h.status = 'active'`,
      [france],
    );
    expect(monarch.rows[0]?.username).toBe("east_member");
    const succession = await db.query<{ detail: string }>("select detail from political_events where country_id = $1 and kind = 'succession'", [france]);
    expect(succession.rows[0]?.detail).toContain("not a real monarch");

    const caseId = await db.query<{ id: string }>("select id from investigations where subject_character_id = $1 and status = 'open'", [president.characterId]);
    await tx((sql) => ruleInvestigation(sql, { userId: rival.userId, investigationId: caseId.rows[0]?.id ?? "", ruling: "uphold" }));
    const stillPresident = await db.query<{ count: number }>(
      `select count(*)::int as count from officeholders h
       join government_offices o on o.id = h.office_id
       where h.character_id = $1 and h.status = 'active' and o.office_key = 'president'`,
      [president.characterId],
    );
    expect(stillPresident.rows[0]?.count).toBe(0);
    const afterRuling = await db.query<{ reputation: number }>("select reputation from characters where id = $1", [president.characterId]);
    expect(afterRuling.rows[0]?.reputation).toBe(0);
  });

  it("counts a due election once from the world tick", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    await db.exec(readFileSync(path.join(directory, "0007_organizations.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0008_world.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0014_travel.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0016_world_events.sql"), "utf8"));
    await db.exec(readFileSync(path.join(directory, "0018_city_contests.sql"), "utf8"));
    const venezuela = await db.query<{ id: string }>("select id from countries where iso2 = 'VE'");
    const countryId = venezuela.rows[0]?.id ?? "";
    const open = await db.query<{ id: string }>(
      "select id from elections where country_id = $1 and kind = 'fptp_office' and status = 'open'",
      [countryId],
    );
    const election = open.rows[0]?.id ?? "";
    const president = await db.query<{ userId: string; characterId: string }>(
      "select user_id as \"userId\", id as \"characterId\" from characters where username = 'ada_vote'",
    );
    const rival = await db.query<{ userId: string; characterId: string }>(
      "select user_id as \"userId\", id as \"characterId\" from characters where username = 'rival_vote'",
    );
    const presidentUser = president.rows[0];
    const rivalUser = rival.rows[0];
    if (!election || !presidentUser || !rivalUser) throw new Error("The election fixtures are missing.");
    await tx((sql) =>
      castVote(sql, { userId: presidentUser.userId, electionId: election, choiceKind: "character", choiceId: presidentUser.characterId }),
    );
    await tx((sql) =>
      castVote(sql, { userId: rivalUser.userId, electionId: election, choiceKind: "character", choiceId: presidentUser.characterId }),
    );
    await db.query("update elections set voting_ends = now() - interval '1 second' where id = $1", [election]);
    await tx((sql) => advanceWorld(sql));
    const seated = await db.query<{ username: string }>(
      `select ch.username
       from officeholders h
       join characters ch on ch.id = h.character_id
       join government_offices o on o.id = h.office_id
       where o.office_key = 'president' and h.status = 'active'`,
    );
    expect(seated.rows.map((row) => row.username)).toEqual(["ada_vote"]);
    const status = await db.query<{ status: string }>("select status from elections where id = $1", [election]);
    expect(status.rows[0]?.status).toBe("closed");
    await tx((sql) => advanceWorld(sql));
    const again = await db.query<{ count: number }>(
      `select count(*)::int as count from officeholders h
       join government_offices o on o.id = h.office_id
       where o.office_key = 'president' and h.status = 'active'`,
    );
    expect(again.rows[0]?.count).toBe(1);

    const openBill = await tx((sql) =>
      proposeBill(sql, {
        userId: presidentUser.userId,
        countryId,
        title: "Tick sales tax",
        body: "Sets the simulated sales tax after the voting deadline.",
        effectKey: "sales_tax_percent",
        effectValue: 12,
      }),
    );
    await tx((sql) => voteBill(sql, { userId: presidentUser.userId, billId: openBill, vote: "yes" }));
    await tx((sql) => advanceWorld(sql));
    const stillVoting = await db.query<{ status: string }>("select status from bills where id = $1", [openBill]);
    expect(stillVoting.rows[0]?.status).toBe("voting");
    await db.query("update bills set voting_ends = now() - interval '1 second' where id = $1", [openBill]);
    let enactedStatus = "voting";
    for (let attempt = 0; attempt < 6 && enactedStatus === "voting"; attempt += 1) {
      await tx((sql) => advanceWorld(sql));
      const enacted = await db.query<{ status: string }>("select status from bills where id = $1", [openBill]);
      enactedStatus = enacted.rows[0]?.status ?? "";
    }
    expect(enactedStatus).toBe("enacted");
    const versions = await db.query<{ count: number }>("select count(*)::int as count from policy_versions where bill_id = $1", [openBill]);
    expect(versions.rows[0]?.count).toBe(1);
    await tx((sql) => advanceWorld(sql));
    const versionsAgain = await db.query<{ count: number }>("select count(*)::int as count from policy_versions where bill_id = $1", [openBill]);
    expect(versionsAgain.rows[0]?.count).toBe(1);

    const emptyBill = await tx((sql) =>
      proposeBill(sql, {
        userId: presidentUser.userId,
        countryId,
        title: "Empty tariff bill",
        body: "This bill receives no votes before its deadline.",
        effectKey: "tariff_percent",
        effectValue: 4,
      }),
    );
    await db.query("update bills set voting_ends = now() - interval '1 second' where id = $1", [emptyBill]);
    let rejectedStatus = "voting";
    for (let attempt = 0; attempt < 6 && rejectedStatus === "voting"; attempt += 1) {
      await tx((sql) => advanceWorld(sql));
      const rejected = await db.query<{ status: string }>("select status from bills where id = $1", [emptyBill]);
      rejectedStatus = rejected.rows[0]?.status ?? "";
    }
    expect(rejectedStatus).toBe("rejected");
    const emptyPolicy = await db.query<{ count: number }>("select count(*)::int as count from policy_versions where bill_id = $1", [emptyBill]);
    expect(emptyPolicy.rows[0]?.count).toBe(0);
  });
});
