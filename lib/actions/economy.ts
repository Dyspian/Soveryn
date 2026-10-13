"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/actions/account";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db";
import { EconomyError } from "@/lib/economy/errors";
import { recordWorkShift } from "@/lib/progression/service";
import { recordShiftBulletin } from "@/lib/world/events";
import {
  acceptApplication,
  applyForJob,
  buyListing,
  cancelListing,
  cancelProduction,
  completeProduction,
  deliverShipment,
  dismissEmployee,
  dispatchShipment,
  foundBusiness,
  listGoods,
  moveFunds,
  openExtractionSite,
  payWages,
  performShift,
  postJob,
  runExtraction,
  startProduction,
} from "@/lib/economy/service";

function refresh() {
  revalidatePath("/businesses");
  revalidatePath("/market");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  revalidatePath("/resources");
  revalidatePath("/missions");
  revalidatePath("/skills");
  revalidatePath("/events");
}

function shiftMessage(
  result: { gross: number; wagePaid: number; wageDue: number; wageState: "none" | "paid" | "already" | "short"; detail: string },
  bulletin: { state: "none" | "recorded" | "already" | "used"; amount?: number },
): string {
  const parts = [result.detail];
  if (result.gross > 0) parts.push(`The business was credited ${result.gross}.`);
  if (result.wageState === "none") parts.push("This was owner labor, so no wage was paid.");
  if (result.wageState === "paid") {
    parts.push(`The worker was paid ${result.wagePaid} for this UTC day.`);
    if (result.gross > 0) parts.push(`The business kept ${result.gross - result.wagePaid} after that wage.`);
  }
  if (result.wageState === "already") parts.push("Today's wage was already paid.");
  if (result.wageState === "short") parts.push(`Today's wage of ${result.wageDue} was not paid because the business balance cannot cover it.`);
  if (bulletin.state === "recorded") parts.push(`This shift counted toward the work bulletin and paid ${bulletin.amount ?? 0}.`);
  if (bulletin.state === "used") parts.push("This shift is already recorded on a joint contract, so the bulletin was not paid.");
  return parts.join(" ");
}

function failure(error: unknown): ActionResult {
  if (error instanceof EconomyError || error instanceof RateLimitError) return { ok: false, error: error.message };
  return { ok: false, error: "The economic action could not be completed." };
}

async function gate(limit: number) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return { user, bucket: `economy:${ip}:${user.id}`, limit };
}

export async function foundBusinessAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, bucket, limit } = await gate(10);
  try {
    const businessId = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, bucket, limit, 10 * 60 * 1000);
      return foundBusiness(sql, {
        userId: user.id,
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        category: String(formData.get("category") ?? ""),
        placeId: String(formData.get("placeId") ?? ""),
        idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      });
    });
    refresh();
    redirect(`/businesses/${businessId}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return failure(error);
  }
}

export async function businessAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, bucket, limit } = await gate(40);
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, bucket, limit, 10 * 60 * 1000);
      const businessId = String(formData.get("businessId") ?? "");
      if (intent === "deposit" || intent === "withdraw") {
        await moveFunds(sql, {
          userId: user.id,
          businessId,
          direction: intent,
          amount: Number(formData.get("amount")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return intent === "deposit" ? "Funds deposited." : "Funds withdrawn.";
      }
      if (intent === "produce") {
        await startProduction(sql, { userId: user.id, businessId, recipeId: String(formData.get("recipeId") ?? "") });
        return "Production started. Inputs were consumed.";
      }
      if (intent === "cancel-production") {
        await cancelProduction(sql, { userId: user.id, jobId: String(formData.get("jobId") ?? "") });
        return "Production was cancelled. Inputs and the operating cost were returned.";
      }
      if (intent === "complete") {
        const result = await completeProduction(sql, { userId: user.id, jobId: String(formData.get("jobId") ?? "") });
        return result === "completed" ? "Production finished and output was stored." : "That job was already finished.";
      }
      if (intent === "extract-open") {
        await openExtractionSite(sql, { userId: user.id, businessId, resourceTypeId: String(formData.get("resourceTypeId") ?? "") });
        return "A simulated extraction site is open. Its capacity is a game value, not the national reserve.";
      }
      if (intent === "extract") {
        const quantity = await runExtraction(sql, { userId: user.id, siteId: String(formData.get("siteId") ?? "") });
        return `Extracted ${quantity} simulated units. The reference statistic was not changed.`;
      }
      if (intent === "payroll") {
        const count = await payWages(sql, { userId: user.id, businessId });
        return `Paid ${count} wage${count === 1 ? "" : "s"} for this UTC day.`;
      }
      if (intent === "shift") {
        const result = await performShift(sql, { userId: user.id, businessId });
        await recordWorkShift(sql, user.id);
        const bulletin = await recordShiftBulletin(sql, user.id);
        return shiftMessage(result, bulletin);
      }
      if (intent === "post-job") {
        await postJob(sql, {
          userId: user.id,
          businessId,
          title: String(formData.get("title") ?? ""),
          wage: Number(formData.get("wage")),
          skillId: String(formData.get("skillId") ?? "") || null,
          minSkillLevel: Number(formData.get("minSkillLevel") ?? 0),
        });
        return "The job is posted.";
      }
      if (intent === "dismiss") {
        await dismissEmployee(sql, { userId: user.id, employmentId: String(formData.get("employmentId") ?? "") });
        return "The employee was dismissed.";
      }
      if (intent === "list") {
        await listGoods(sql, {
          userId: user.id,
          holderKind: "business",
          holderId: businessId,
          placeId: String(formData.get("placeId") ?? ""),
          productId: String(formData.get("productId") ?? ""),
          quantity: Number(formData.get("quantity")),
          unitPrice: Number(formData.get("unitPrice")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return "The goods were listed and removed from company stock.";
      }
      if (intent === "ship") {
        await dispatchShipment(sql, {
          userId: user.id,
          holderKind: "business",
          holderId: businessId,
          originPlaceId: String(formData.get("originPlaceId") ?? ""),
          destinationPlaceId: String(formData.get("destinationPlaceId") ?? ""),
          productId: String(formData.get("productId") ?? ""),
          quantity: Number(formData.get("quantity")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return "Shipment dispatched. Cost uses a simulated great-circle distance.";
      }
      if (intent === "deliver") {
        const result = await deliverShipment(sql, { userId: user.id, shipmentId: String(formData.get("shipmentId") ?? "") });
        return result === "delivered" ? "The shipment was delivered." : "The shipment is still in transit.";
      }
      throw new EconomyError("That business action is not recognized.");
    });
    refresh();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function marketAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, bucket, limit } = await gate(40);
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, bucket, limit, 10 * 60 * 1000);
      if (intent === "buy") {
        const result = await buyListing(sql, { userId: user.id, listingId: String(formData.get("listingId") ?? "") });
        return result === "replayed" ? "That purchase was already completed." : "Purchase completed.";
      }
      if (intent === "cancel") {
        await cancelListing(sql, { userId: user.id, listingId: String(formData.get("listingId") ?? "") });
        return "Listing cancelled and stock returned.";
      }
      if (intent === "list") {
        const holderKind = String(formData.get("holderKind") ?? "");
        if (holderKind !== "character" && holderKind !== "business") throw new EconomyError("Choose who is selling.");
        await listGoods(sql, {
          userId: user.id,
          holderKind,
          holderId: String(formData.get("holderId") ?? ""),
          placeId: String(formData.get("placeId") ?? ""),
          productId: String(formData.get("productId") ?? ""),
          quantity: Number(formData.get("quantity")),
          unitPrice: Number(formData.get("unitPrice")),
          idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
        });
        return "The goods were listed and removed from available stock.";
      }
      throw new EconomyError("That market action is not recognized.");
    });
    refresh();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function jobAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { user, bucket, limit } = await gate(30);
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, bucket, limit, 10 * 60 * 1000);
      if (intent === "apply") {
        await applyForJob(sql, { userId: user.id, postingId: String(formData.get("postingId") ?? "") });
        return "Application sent.";
      }
      if (intent === "accept") {
        await acceptApplication(sql, { userId: user.id, applicationId: String(formData.get("applicationId") ?? "") });
        return "The applicant was hired. They can work a shift at your company from this page.";
      }
      if (intent === "shift") {
        const result = await performShift(sql, { userId: user.id, businessId: String(formData.get("businessId") ?? "") });
        await recordWorkShift(sql, user.id);
        const bulletin = await recordShiftBulletin(sql, user.id);
        return shiftMessage(result, bulletin);
      }
      throw new EconomyError("That job action is not recognized.");
    });
    refresh();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}
