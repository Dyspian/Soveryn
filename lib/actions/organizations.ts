"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/actions/account";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db";
import { EconomyError } from "@/lib/economy/errors";
import { OrgError } from "@/lib/organizations/domain";
import {
  acceptDelivery,
  buyUnderground,
  cancelOperation,
  createDelivery,
  departDelivery,
  endorseCandidate,
  joinOperation,
  launchOperation,
  leaveOperation,
  layLow,
  listUnderground,
  openOperation,
  payFine,
  resolveDelivery,
  recordJointShift,
  resolveOperation,
  reviewCase,
} from "@/lib/organizations/play";
import { acceptCityContest, cancelCityContest, proposeCityContest, supportCityContest } from "@/lib/organizations/contests";
import { acceptAgreement, declareRivalry, endRelation, proposeAgreement } from "@/lib/organizations/relations";
import {
  addLocation,
  applyToOrganization,
  createOrganization,
  dissolveOrganization,
  inviteMember,
  leaveOrganization,
  markNoticeRead,
  removeMember,
  renameRank,
  respondInvitation,
  reviewApplication,
  setPermission,
  setRank,
  transferLeadership,
} from "@/lib/organizations/service";
import { depositTreasury, withdrawTreasury } from "@/lib/organizations/treasury";

function failure(error: unknown): ActionResult {
  if (error instanceof OrgError || error instanceof EconomyError || error instanceof RateLimitError) return { ok: false, error: error.message };
  const message = error instanceof Error ? error.message : "";
  if (message.includes("organizations_name") || message.includes("organizations_tag")) return { ok: false, error: "That name or tag is already in use." };
  return { ok: false, error: "That organization action could not be completed." };
}

export async function organizationsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, `organizations:${ip}:${user.id}`, 40, 10 * 60 * 1000);
      const organizationId = String(formData.get("organizationId") ?? "");
      if (intent === "create") {
        const id = await createOrganization(sql, {
          userId: user.id,
          name: String(formData.get("name") ?? ""),
          tag: String(formData.get("tag") ?? ""),
          description: String(formData.get("description") ?? ""),
          orgType: String(formData.get("orgType") ?? ""),
          placeId: String(formData.get("placeId") ?? ""),
          recruitment: String(formData.get("recruitment") ?? "") as "open" | "application" | "closed",
          visibility: String(formData.get("visibility") ?? "") as "public" | "private",
          emblemKey: String(formData.get("emblemKey") ?? "") || null,
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return id;
      }
      if (intent === "invite") {
        await inviteMember(sql, { userId: user.id, organizationId, username: String(formData.get("username") ?? "") });
        return "The invitation was sent.";
      }
      if (intent === "respond-invite") {
        await respondInvitation(sql, { userId: user.id, invitationId: String(formData.get("invitationId") ?? ""), accept: formData.get("accept") === "yes" });
        return "The invitation was updated.";
      }
      if (intent === "apply") {
        const result = await applyToOrganization(sql, { userId: user.id, organizationId });
        return result === "joined" ? "You joined the organization." : "Your application is pending.";
      }
      if (intent === "review-application") {
        await reviewApplication(sql, { userId: user.id, applicationId: String(formData.get("applicationId") ?? ""), approve: formData.get("approve") === "yes" });
        return "The application was reviewed.";
      }
      if (intent === "leave") {
        await leaveOrganization(sql, { userId: user.id, organizationId });
        return "You left the organization.";
      }
      if (intent === "remove") {
        await removeMember(sql, { userId: user.id, organizationId, username: String(formData.get("username") ?? "") });
        return "The member was removed.";
      }
      if (intent === "rank") {
        await setRank(sql, { userId: user.id, organizationId, username: String(formData.get("username") ?? ""), rankKey: String(formData.get("rankKey") ?? "") });
        return "The rank was updated.";
      }
      if (intent === "transfer") {
        await transferLeadership(sql, { userId: user.id, organizationId, username: String(formData.get("username") ?? ""), idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
        return "Leadership was transferred.";
      }
      if (intent === "dissolve") {
        if (formData.get("confirm") !== "yes") throw new OrgError("Confirm the dissolution.");
        await dissolveOrganization(sql, { userId: user.id, organizationId, idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
        return "The organization was dissolved.";
      }
      if (intent === "rename-rank") {
        await renameRank(sql, { userId: user.id, organizationId, rankKey: String(formData.get("rankKey") ?? ""), name: String(formData.get("name") ?? "") });
        return "The rank name was saved.";
      }
      if (intent === "permission") {
        await setPermission(sql, {
          userId: user.id,
          organizationId,
          rankKey: String(formData.get("rankKey") ?? ""),
          permission: String(formData.get("permission") ?? ""),
          enabled: formData.get("enabled") === "yes",
        });
        return "The permission was saved.";
      }
      if (intent === "location") {
        await addLocation(sql, { userId: user.id, organizationId, placeId: String(formData.get("placeId") ?? "") });
        return "The operational location was saved.";
      }
      if (intent === "deposit") {
        const paid = await depositTreasury(sql, { userId: user.id, organizationId, amount: Number(formData.get("amount")), idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
        return paid === "applied" ? "The contribution was recorded." : "That contribution was already recorded.";
      }
      if (intent === "withdraw") {
        const paid = await withdrawTreasury(sql, {
          userId: user.id,
          organizationId,
          username: String(formData.get("username") ?? ""),
          amount: Number(formData.get("amount")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        if (paid === "pending") return "A second officer must approve that withdrawal.";
        return paid === "applied" ? "The withdrawal was paid." : "That withdrawal was already recorded.";
      }
      if (intent === "operation-open") {
        await openOperation(sql, { userId: user.id, definitionKey: String(formData.get("definitionKey") ?? ""), placeId: String(formData.get("placeId") ?? "") });
        return "The contract is being prepared.";
      }
      if (intent === "operation-join") {
        await joinOperation(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return "You joined the contract.";
      }
      if (intent === "operation-launch") {
        await launchOperation(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return "The contract is in progress.";
      }
      if (intent === "operation-resolve") {
        const result = await resolveOperation(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return `The contract is ${result}.`;
      }
      if (intent === "operation-record") {
        await recordJointShift(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return "The company shift was recorded on the joint contract.";
      }
      if (intent === "operation-leave") {
        await leaveOperation(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return "You left the contract.";
      }
      if (intent === "operation-cancel") {
        await cancelOperation(sql, { userId: user.id, operationId: String(formData.get("operationId") ?? "") });
        return "The contract was cancelled.";
      }
      if (intent === "lay-low") {
        await layLow(sql, { userId: user.id });
        return "Heat was reduced.";
      }
      if (intent === "pay-fine") {
        await payFine(sql, { userId: user.id, idempotencyKey: String(formData.get("idempotencyKey") ?? "") });
        return "The fine was paid.";
      }
      if (intent === "review-case") {
        const result = await reviewCase(sql, { userId: user.id });
        return result === "restricted" ? "The investigation applied a fine and a market restriction." : "The investigation closed.";
      }
      if (intent === "list-market") {
        await listUnderground(sql, {
          userId: user.id,
          placeId: String(formData.get("placeId") ?? ""),
          productId: String(formData.get("productId") ?? ""),
          quantity: Number(formData.get("quantity")),
          unitPrice: Number(formData.get("unitPrice")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return "The listing is open. The seller name is hidden.";
      }
      if (intent === "buy-market") {
        const result = await buyUnderground(sql, { userId: user.id, listingId: String(formData.get("listingId") ?? "") });
        return result === "bought" ? "The purchase was recorded." : "That purchase was already recorded.";
      }
      if (intent === "delivery-create") {
        await createDelivery(sql, {
          userId: user.id,
          originPlaceId: String(formData.get("originPlaceId") ?? ""),
          destinationPlaceId: String(formData.get("destinationPlaceId") ?? ""),
          productId: String(formData.get("productId") ?? ""),
          quantity: Number(formData.get("quantity")),
          payment: Number(formData.get("payment")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return "The delivery contract is available.";
      }
      if (intent === "delivery-accept") {
        await acceptDelivery(sql, { userId: user.id, contractId: String(formData.get("contractId") ?? "") });
        return "You accepted the delivery.";
      }
      if (intent === "delivery-depart") {
        await departDelivery(sql, { userId: user.id, contractId: String(formData.get("contractId") ?? "") });
        return "The delivery is in transit.";
      }
      if (intent === "delivery-resolve") {
        const result = await resolveDelivery(sql, { userId: user.id, contractId: String(formData.get("contractId") ?? "") });
        return result === "completed" ? "The delivery was completed." : "The delivery failed and the cargo was lost.";
      }
      if (intent === "propose") {
        await proposeAgreement(sql, { userId: user.id, organizationId, otherOrganizationId: String(formData.get("otherOrganizationId") ?? ""), proposal: String(formData.get("proposal") ?? "") });
        return "The proposal was sent. It is not binding yet.";
      }
      if (intent === "accept-agreement") {
        await acceptAgreement(sql, { userId: user.id, organizationId, otherOrganizationId: String(formData.get("otherOrganizationId") ?? "") });
        return "The agreement was accepted.";
      }
      if (intent === "rivalry") {
        await declareRivalry(sql, { userId: user.id, organizationId, otherOrganizationId: String(formData.get("otherOrganizationId") ?? "") });
        return "The rivalry was declared.";
      }
      if (intent === "end-relation") {
        await endRelation(sql, { userId: user.id, organizationId, otherOrganizationId: String(formData.get("otherOrganizationId") ?? "") });
        return "The relationship was ended.";
      }
      if (intent === "contest-propose") {
        await proposeCityContest(sql, {
          userId: user.id,
          organizationId,
          otherOrganizationId: String(formData.get("otherOrganizationId") ?? ""),
          placeId: String(formData.get("placeId") ?? ""),
        });
        return "The presence contest was proposed. Neither treasury is charged until the other organization accepts.";
      }
      if (intent === "contest-accept") {
        await acceptCityContest(sql, { userId: user.id, contestId: String(formData.get("contestId") ?? "") });
        return "The contest started. Both treasuries paid the stake.";
      }
      if (intent === "contest-support") {
        await supportCityContest(sql, { userId: user.id, contestId: String(formData.get("contestId") ?? "") });
        return "Your support was recorded once.";
      }
      if (intent === "contest-cancel") {
        await cancelCityContest(sql, { userId: user.id, contestId: String(formData.get("contestId") ?? "") });
        return "The proposed contest was cancelled. No stake was charged.";
      }
      if (intent === "endorse") {
        await endorseCandidate(sql, { userId: user.id, organizationId, username: String(formData.get("username") ?? "") });
        return "The endorsement was recorded. It does not add votes.";
      }
      if (intent === "read-notice") {
        await markNoticeRead(sql, { userId: user.id, noticeId: String(formData.get("noticeId") ?? "") });
        return "The notice was marked read.";
      }
      throw new OrgError("That organization action is not recognized.");
    });
    revalidatePath("/organizations");
    revalidatePath(`/organizations/${String(formData.get("organizationId") ?? "")}`);
    return { ok: true, message: intent === "create" ? "The organization was founded." : message };
  } catch (error) {
    return failure(error);
  }
}
