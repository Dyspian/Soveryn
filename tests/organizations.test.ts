import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { RateLimitError } from "@/lib/auth/rate-limit";
import { limitOrgAction, notify } from "@/lib/organizations/access";
import { loadNoticeFeed, organizationDesk } from "@/lib/organizations/queries";
import { buyUnderground, createDelivery, departDelivery, listUnderground, openOperation, resolveDelivery, resolveOperation, reviewCase, acceptDelivery, launchOperation } from "@/lib/organizations/play";
import { acceptAgreement, proposeAgreement } from "@/lib/organizations/relations";
import { applyToOrganization, createOrganization, dissolveOrganization, inviteMember, markAllNoticesRead, markNoticeRead, removeMember, respondInvitation, setRank, transferLeadership } from "@/lib/organizations/service";
import { depositTreasury, withdrawTreasury } from "@/lib/organizations/treasury";
import { provisionNewCharacter } from "@/lib/progression/service";

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

describe("organizations", () => {
  afterAll(async () => {
    await db.close();
  });

  it("runs membership, treasury, contracts, deliveries, and access checks", async () => {
    const directory = path.join(process.cwd(), "db", "migrations");
    for (const file of ["0001_foundation.sql", "0003_progression.sql", "0004_economy.sql", "0005_politics.sql", "0006_politics_gaps.sql", "0007_organizations.sql", "0018_city_contests.sql"]) {
      await db.exec(readFileSync(path.join(directory, file), "utf8"));
    }

    async function country(iso2: string, iso3: string, name: string) {
      const rows = await db.query<{ id: string }>(
        `insert into countries (iso2, iso3, name, population_quality, starting_city_target, starting_city_min, starting_city_max)
         values ($1, $2, $3, 'imported', 5, 5, 10) returning id`,
        [iso2, iso3, name],
      );
      return rows.rows[0]?.id ?? "";
    }
    const nigeria = await country("NG", "NGA", "Nigeria");
    const belgium = await country("BE", "BEL", "Belgium");
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
    const lagos = await place(1, nigeria, "Lagos", 6.45, 3.4);
    const abuja = await place(2, nigeria, "Abuja", 9.07, 7.4);
    const brussels = await place(3, belgium, "Brussels", 50.85, 4.35);

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
      await db.query("update characters set currency = 800, level = 2 where id = $1", [characterId]);
      return { userId, characterId };
    }

    const founder = await person("founder@example.com", "ada_org", nigeria, lagos);
    const recruit = await person("recruit@example.com", "ben_org", nigeria, lagos);
    const deputy = await person("deputy@example.com", "chi_org", nigeria, lagos);
    const outsider = await person("outsider@example.com", "dua_org", belgium, brussels);
    const carrier = await person("carrier@example.com", "edi_org", nigeria, abuja);

    await expect(
      tx((sql) =>
        createOrganization(sql, {
          userId: founder.userId,
          name: "Lagos Desk",
          tag: "LD",
          description: "A game syndicate.",
          orgType: "syndicate",
          placeId: brussels,
          recruitment: "application",
          visibility: "private",
          emblemKey: null,
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
        }),
      ),
    ).rejects.toThrow(/headquarters/);

    const organizationId = await tx((sql) =>
      createOrganization(sql, {
        userId: founder.userId,
        name: "Lagos Desk",
        tag: "LD",
        description: "A game syndicate.",
        orgType: "syndicate",
        placeId: lagos,
        recruitment: "application",
        visibility: "private",
        emblemKey: "mark-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(await organizationDesk(asSql(db), organizationId, outsider.characterId)).toBeNull();
    await expect(
      tx((sql) =>
        createOrganization(sql, {
          userId: outsider.userId,
          name: "Lagos Desk",
          tag: "LX",
          description: "Duplicate.",
          orgType: "trade_association",
          placeId: brussels,
          recruitment: "closed",
          visibility: "public",
          emblemKey: null,
          idempotencyKey: "11111111-1111-4111-8111-111111111112",
        }),
      ),
    ).rejects.toThrow(/organizations_name|duplicate|unique/i);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        tx((sql) =>
          createOrganization(sql, {
            userId: founder.userId,
            name: `Extra ${attempt}`,
            tag: `E${attempt}`,
            description: "",
            orgType: "syndicate",
            placeId: lagos,
            recruitment: "closed",
            visibility: "public",
            emblemKey: null,
            idempotencyKey: `22222222-2222-4222-8222-22222222222${attempt}`,
          }),
        ),
      ).rejects.toThrow(/current organization/);
    }
    await tx(async (sql) => {
      for (let hit = 0; hit < 4; hit += 1) await limitOrgAction(sql, founder.userId, "create", 5);
    });
    await expect(
      tx((sql) =>
        createOrganization(sql, {
          userId: founder.userId,
          name: "Sixth Try",
          tag: "SIX",
          description: "",
          orgType: "syndicate",
          placeId: lagos,
          recruitment: "closed",
          visibility: "public",
          emblemKey: null,
          idempotencyKey: "22222222-2222-4222-8222-222222222229",
        }),
      ),
    ).rejects.toBeInstanceOf(RateLimitError);

    await tx((sql) => inviteMember(sql, { userId: founder.userId, organizationId, username: "ben_org" }));
    const invitation = await db.query<{ id: string }>("select id from organization_invitations where character_id = $1", [recruit.characterId]);
    await tx((sql) => respondInvitation(sql, { userId: recruit.userId, invitationId: invitation.rows[0]?.id ?? "", accept: true }));
    await expect(tx((sql) => withdrawTreasury(sql, { userId: recruit.userId, organizationId, username: "ben_org", amount: 5, idempotencyKey: "33333333-3333-4333-8333-333333333331" }))).rejects.toThrow(/permission/);
    await expect(tx((sql) => setRank(sql, { userId: recruit.userId, organizationId, username: "ada_org", rankKey: "leader" }))).rejects.toThrow(/permission/);

    await tx((sql) => inviteMember(sql, { userId: founder.userId, organizationId, username: "chi_org" }));
    const deputyInvite = await db.query<{ id: string }>("select id from organization_invitations where character_id = $1", [deputy.characterId]);
    await tx((sql) => respondInvitation(sql, { userId: deputy.userId, invitationId: deputyInvite.rows[0]?.id ?? "", accept: true }));
    await tx((sql) => setRank(sql, { userId: founder.userId, organizationId, username: "chi_org", rankKey: "deputy" }));
    await expect(tx((sql) => removeMember(sql, { userId: deputy.userId, organizationId, username: "ada_org" }))).rejects.toThrow(/cannot remove/);

    await tx((sql) => depositTreasury(sql, { userId: founder.userId, organizationId, amount: 40, idempotencyKey: "44444444-4444-4444-8444-444444444441" }));
    await tx((sql) => depositTreasury(sql, { userId: founder.userId, organizationId, amount: 40, idempotencyKey: "44444444-4444-4444-8444-444444444441" }));
    const deposited = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [organizationId]);
    expect(deposited.rows[0]?.balance).toBe("40");
    const raced = await Promise.allSettled([
      tx((sql) => withdrawTreasury(sql, { userId: founder.userId, organizationId, username: "ben_org", amount: 30, idempotencyKey: "44444444-4444-4444-8444-444444444442" })),
      tx((sql) => withdrawTreasury(sql, { userId: founder.userId, organizationId, username: "chi_org", amount: 30, idempotencyKey: "44444444-4444-4444-8444-444444444443" })),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const afterRace = await db.query<{ balance: string }>("select balance::text as balance from organizations where id = $1", [organizationId]);
    expect(Number(afterRace.rows[0]?.balance)).toBe(10);

    await tx((sql) => depositTreasury(sql, { userId: founder.userId, organizationId, amount: 50, idempotencyKey: "44444444-4444-4444-8444-444444444444" }));
    expect(await tx((sql) => withdrawTreasury(sql, { userId: founder.userId, organizationId, username: "ada_org", amount: 40, idempotencyKey: "55555555-5555-4555-8555-555555555551" }))).toBe("pending");
    expect(await tx((sql) => withdrawTreasury(sql, { userId: founder.userId, organizationId, username: "ada_org", amount: 40, idempotencyKey: "55555555-5555-4555-8555-555555555551" }))).toBe("pending");
    expect(await tx((sql) => withdrawTreasury(sql, { userId: deputy.userId, organizationId, username: "ada_org", amount: 40, idempotencyKey: "55555555-5555-4555-8555-555555555551" }))).toBe("applied");
    const ledger = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = 'org-withdraw:55555555-5555-4555-8555-555555555551'");
    expect(ledger.rows[0]?.count).toBe(1);

    await db.query("update character_underworld set planning = 10 where character_id = $1", [founder.characterId]);
    await db.query("insert into character_underworld (character_id, planning) values ($1, 10) on conflict (character_id) do update set planning = 10", [founder.characterId]);
    const operationId = await tx((sql) => openOperation(sql, { userId: founder.userId, definitionKey: "survey", placeId: lagos }));
    await tx((sql) => launchOperation(sql, { userId: founder.userId, operationId }));
    await db.query("update operations set completes_at = now() - interval '1 second' where id = $1", [operationId]);
    expect(await tx((sql) => resolveOperation(sql, { userId: founder.userId, operationId }))).toBe("completed");
    expect(await tx((sql) => resolveOperation(sql, { userId: founder.userId, operationId }))).toBe("completed");
    const rewards = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = $1", [`op:${operationId}:reward`]);
    expect(rewards.rows[0]?.count).toBe(1);

    await db.query(
      "insert into stock_holdings (holder_kind, holder_id, place_id, product_id, quantity) values ('character', $1, $2, 'sealed_crate', 2)",
      [founder.characterId, lagos],
    );
    const listingId = await tx((sql) =>
      listUnderground(sql, { userId: founder.userId, placeId: lagos, productId: "sealed_crate", quantity: 1, unitPrice: 10, idempotencyKey: "66666666-6666-4666-8666-666666666661" }),
    );
    const bought = await Promise.allSettled([
      tx((sql) => buyUnderground(sql, { userId: recruit.userId, listingId })),
      tx((sql) => buyUnderground(sql, { userId: deputy.userId, listingId })),
    ]);
    expect(bought.filter((result) => result.status === "fulfilled" && result.value === "bought")).toHaveLength(1);
    const crate = await db.query<{ quantity: number }>(
      "select coalesce(sum(quantity), 0)::int as quantity from stock_holdings where product_id = 'sealed_crate' and holder_kind = 'character'",
    );
    expect(crate.rows[0]?.quantity).toBe(2);

    const contractId = await tx((sql) =>
      createDelivery(sql, {
        userId: founder.userId,
        originPlaceId: lagos,
        destinationPlaceId: abuja,
        productId: "sealed_crate",
        quantity: 1,
        payment: 12,
        idempotencyKey: "77777777-7777-4777-8777-777777777771",
      }),
    );
    await tx((sql) => acceptDelivery(sql, { userId: carrier.userId, contractId }));
    await db.query("update character_underworld set concealment = 10 where character_id = $1", [carrier.characterId]);
    await db.query("insert into character_underworld (character_id, concealment) values ($1, 10) on conflict (character_id) do update set concealment = 10", [carrier.characterId]);
    await tx((sql) => departDelivery(sql, { userId: carrier.userId, contractId }));
    await db.query("update delivery_contracts set arrives_at = now() - interval '1 second' where id = $1", [contractId]);
    expect(await tx((sql) => resolveDelivery(sql, { userId: carrier.userId, contractId }))).toBe("completed");
    expect(await tx((sql) => resolveDelivery(sql, { userId: carrier.userId, contractId }))).toBe("completed");
    const payouts = await db.query<{ count: number }>("select count(*)::int as count from ledger_entries where idempotency_key = $1", [`delivery:${contractId}:payout`]);
    expect(payouts.rows[0]?.count).toBe(1);

    await db.query("insert into character_underworld (character_id, heat) values ($1, 40) on conflict (character_id) do update set heat = 40", [recruit.characterId]);
    await db.query(
      "insert into enforcement_cases (character_id, organization_id, country_id, status, evidence) values ($1, $2, $3, 'active', 40)",
      [recruit.characterId, organizationId, nigeria],
    );
    expect(await tx((sql) => reviewCase(sql, { userId: recruit.userId }))).toBe("restricted");

    const lawful = await tx((sql) =>
      createOrganization(sql, {
        userId: outsider.userId,
        name: "Brussels Guild",
        tag: "BG",
        description: "A lawful association.",
        orgType: "trade_association",
        placeId: brussels,
        recruitment: "open",
        visibility: "public",
        emblemKey: null,
        idempotencyKey: "88888888-8888-4888-8888-888888888881",
      }),
    );
    await tx((sql) => proposeAgreement(sql, { userId: founder.userId, organizationId, otherOrganizationId: lawful, proposal: "ceasefire" }));
    await tx((sql) => acceptAgreement(sql, { userId: outsider.userId, organizationId: lawful, otherOrganizationId: organizationId }));
    const relation = await db.query<{ status: string }>("select status from organization_relations");
    expect(relation.rows[0]?.status).toBe("ceasefire");

    await tx((sql) => transferLeadership(sql, { userId: founder.userId, organizationId, username: "chi_org", idempotencyKey: "99999999-9999-4999-8999-999999999991" }));
    const leader = await db.query<{ username: string }>(
      `select ch.username from organizations o join characters ch on ch.id = o.leader_character_id where o.id = $1`,
      [organizationId],
    );
    expect(leader.rows[0]?.username).toBe("chi_org");
    await expect(tx((sql) => applyToOrganization(sql, { userId: carrier.userId, organizationId: lawful }))).resolves.toBe("joined");
    await tx((sql) => dissolveOrganization(sql, { userId: deputy.userId, organizationId, idempotencyKey: "99999999-9999-4999-8999-999999999992" }));
    const status = await db.query<{ status: string }>("select status from organizations where id = $1", [organizationId]);
    expect(status.rows[0]?.status).toBe("dissolved");

    const before = await loadNoticeFeed(asSql(db), recruit.characterId);
    await tx((sql) => notify(sql, recruit.characterId, organizationId, "rank", "Your organization rank changed.", "rank:test-owned"));
    await tx((sql) => notify(sql, recruit.characterId, organizationId, "rank", "duplicate", "rank:test-owned"));
    const added = await loadNoticeFeed(asSql(db), recruit.characterId);
    const mine = added.notices.find((notice) => notice.detail === "Your organization rank changed.");
    expect(added.unread).toBe(before.unread + 1);
    expect(mine?.organizationId).toBe(organizationId);
    await tx((sql) => markAllNoticesRead(sql, { userId: outsider.userId }));
    await tx((sql) => markNoticeRead(sql, { userId: outsider.userId, noticeId: mine?.id ?? "" }));
    expect((await loadNoticeFeed(asSql(db), recruit.characterId)).unread).toBe(before.unread + 1);
    await tx((sql) => markNoticeRead(sql, { userId: recruit.userId, noticeId: mine?.id ?? "" }));
    expect((await loadNoticeFeed(asSql(db), recruit.characterId)).unread).toBe(before.unread);
  });
});
