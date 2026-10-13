"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/actions/account";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db";
import { EconomyError } from "@/lib/economy/errors";
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
  declareEmergency,
  depositPartyFunds,
  joinParty,
  leaveParty,
  proposeBill,
  registerCandidate,
  ruleInvestigation,
  scheduleElection,
  setDiplomacy,
  signCoalition,
  signTreaty,
  spendTreasury,
  succeedMonarch,
  voteBill,
} from "@/lib/politics/service";

function failure(error: unknown): ActionResult {
  if (error instanceof PoliticsError || error instanceof EconomyError || error instanceof RateLimitError) return { ok: false, error: error.message };
  if (error instanceof Error && error.message.includes("enough")) return { ok: false, error: error.message };
  return { ok: false, error: "The political action could not be completed." };
}

async function gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return { user, bucket: `politics:${ip}:${user.id}` };
}

function refresh() {
  revalidatePath("/politics");
  revalidatePath("/politics/[iso2]", "page");
  revalidatePath("/map");
}

export async function politicsAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, bucket } = await gate();
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, bucket, 40, 10 * 60 * 1000);
      const countryId = String(formData.get("countryId") ?? "");
      if (intent === "adopt") {
        await adoptConstitution(sql, { userId: user.id, countryId, templateId: String(formData.get("templateId") ?? "") });
        return "The game constitution is in place. Offices start vacant.";
      }
      if (intent === "party") {
        await createParty(sql, {
          userId: user.id,
          name: String(formData.get("name") ?? ""),
          abbreviation: String(formData.get("abbreviation") ?? ""),
          platform: String(formData.get("platform") ?? ""),
        });
        return "The party was founded.";
      }
      if (intent === "join") {
        await joinParty(sql, { userId: user.id, partyId: String(formData.get("partyId") ?? "") });
        return "You joined the party.";
      }
      if (intent === "leave") {
        await leaveParty(sql, { userId: user.id });
        return "You left the party.";
      }
      if (intent === "deposit") {
        await depositPartyFunds(sql, { userId: user.id, amount: Number(formData.get("amount")), idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
        return "The treasury deposit was recorded.";
      }
      if (intent === "schedule") {
        const kind = String(formData.get("kind") ?? "");
        if (kind !== "fptp_office" && kind !== "pr_parliament" && kind !== "two_round" && kind !== "party_leadership" && kind !== "confidence") {
          throw new PoliticsError("That election type is not available.");
        }
        await scheduleElection(sql, { userId: user.id, countryId, kind, officeKey: String(formData.get("officeKey") ?? "") || undefined });
        return "The election is open for candidates.";
      }
      if (intent === "advance") {
        await advanceElection(sql, { userId: user.id, electionId: String(formData.get("electionId") ?? "") });
        return "The election period moved forward.";
      }
      if (intent === "register") {
        await registerCandidate(sql, { userId: user.id, electionId: String(formData.get("electionId") ?? "") });
        return "You are registered.";
      }
      if (intent === "speech") {
        const result = await campaignSpeech(sql, { userId: user.id, electionId: String(formData.get("electionId") ?? "") });
        return result === "recorded"
          ? "The speech was recorded. It adds campaign attention and breaks ties. It does not add votes."
          : "That speech was already paid for this round.";
      }
      if (intent === "vote") {
        const choiceKind = String(formData.get("choiceKind") ?? "");
        if (choiceKind !== "character" && choiceKind !== "party" && choiceKind !== "yesno") throw new PoliticsError("That ballot is not valid.");
        await castVote(sql, {
          userId: user.id,
          electionId: String(formData.get("electionId") ?? ""),
          choiceKind,
          choiceId: String(formData.get("choiceId") ?? "") || undefined,
          choiceValue: String(formData.get("choiceValue") ?? "") || undefined,
        });
        return "Your ballot was recorded.";
      }
      if (intent === "close") {
        const result = await closeElection(sql, { userId: user.id, electionId: String(formData.get("electionId") ?? "") });
        return `The count finished: ${result}.`;
      }
      if (intent === "form") {
        await formGovernment(sql, { userId: user.id, countryId });
        return "The largest party formed the government.";
      }
      if (intent === "appoint") {
        const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [String(formData.get("username") ?? "")]);
        if (!found[0]) throw new PoliticsError("No character uses that username.");
        await appointMinister(sql, { userId: user.id, countryId, officeKey: String(formData.get("officeKey") ?? ""), characterId: found[0].id });
        return "The appointment was recorded.";
      }
      if (intent === "claim") {
        await claimRuledOffice(sql, { userId: user.id, countryId });
        return "The vacant office was claimed.";
      }
      if (intent === "challenge") {
        await challengeRuler(sql, { userId: user.id, countryId });
        return "The ruler was replaced.";
      }
      if (intent === "emergency") {
        await declareEmergency(sql, { userId: user.id, countryId });
        return "Opposition party formation is now restricted in this game.";
      }
      if (intent === "bill") {
        const effectKey = String(formData.get("effectKey") ?? "");
        if (effectKey !== "sales_tax_percent" && effectKey !== "tariff_percent" && effectKey !== "wage_floor" && effectKey !== "extraction_cost") {
          throw new PoliticsError("That policy is not available.");
        }
        await proposeBill(sql, {
          userId: user.id,
          countryId,
          title: String(formData.get("title") ?? ""),
          body: String(formData.get("body") ?? ""),
          effectKey,
          effectValue: Number(formData.get("effectValue")),
        });
        return "The bill is open for votes.";
      }
      if (intent === "vote-bill") {
        const vote = String(formData.get("vote") ?? "");
        if (vote !== "yes" && vote !== "no") throw new PoliticsError("Vote yes or no.");
        await voteBill(sql, { userId: user.id, billId: String(formData.get("billId") ?? ""), vote });
        return "Your legislative vote was recorded.";
      }
      if (intent === "close-bill") {
        await closeBill(sql, { userId: user.id, billId: String(formData.get("billId") ?? "") });
        return "The bill was counted.";
      }
      if (intent === "spend") {
        const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [String(formData.get("username") ?? "")]);
        if (!found[0]) throw new PoliticsError("No character uses that username.");
        const paid = await spendTreasury(sql, {
          userId: user.id,
          countryId,
          characterId: found[0].id,
          amount: Number(formData.get("amount")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return paid === "applied" ? "The payment was recorded in the ledger." : "That payment was already recorded.";
      }
      if (intent === "coalition") {
        await signCoalition(sql, { userId: user.id, countryId, otherPartyId: String(formData.get("partyId") ?? "") });
        return "The coalition agreement was signed.";
      }
      if (intent === "investigation") {
        const ruling = String(formData.get("ruling") ?? "");
        if (ruling !== "uphold" && ruling !== "dismiss") throw new PoliticsError("Uphold or dismiss the investigation.");
        await ruleInvestigation(sql, { userId: user.id, investigationId: String(formData.get("investigationId") ?? ""), ruling });
        return ruling === "uphold" ? "The investigation was upheld." : "The investigation was dismissed.";
      }
      if (intent === "treaty") {
        const countries = await sql.query<{ id: string }>("select id from countries where iso2 = $1", [String(formData.get("iso2") ?? "").toUpperCase()]);
        if (!countries[0]) throw new PoliticsError("That country code is not in the game.");
        await signTreaty(sql, { userId: user.id, otherCountryId: countries[0].id, title: String(formData.get("title") ?? "") });
        return "The treaty was signed. It has no military effect.";
      }
      if (intent === "succession") {
        const found = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [String(formData.get("username") ?? "")]);
        if (!found[0]) throw new PoliticsError("No character uses that username.");
        await succeedMonarch(sql, { userId: user.id, countryId, characterId: found[0].id });
        return "The game succession was recorded. It is not a real monarch.";
      }
      if (intent === "diplomacy") {
        const status = String(formData.get("status") ?? "");
        if (status !== "friendly" && status !== "neutral" && status !== "strained" && status !== "sanctioned") throw new PoliticsError("That status is not recognized.");
        await setDiplomacy(sql, { userId: user.id, otherCountryId: String(formData.get("otherCountryId") ?? ""), status, note: String(formData.get("note") ?? "") });
        return "The diplomatic status was saved.";
      }
      throw new PoliticsError("That political action is not recognized.");
    });
    refresh();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}
