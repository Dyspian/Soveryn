"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { withTransaction } from "@/lib/db";
import {
  acceptMission,
  deliverShipment,
  practiceSkill,
  ProgressionError,
  spendSkillPoint,
  unlockSkillNode,
  submitIntroduction,
  submitPopulation,
} from "@/lib/progression/service";
import type { ActionResult } from "@/lib/actions/account";

async function clientKey(prefix: string, userId: string): Promise<string> {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return `${prefix}:${ip}:${userId}`;
}

function refreshProgression(): void {
  revalidatePath("/dashboard");
  revalidatePath("/missions");
  revalidatePath("/skills");
  revalidatePath("/inventory");
  revalidatePath("/character");
}

function failure(error: unknown): ActionResult {
  if (error instanceof ProgressionError || error instanceof RateLimitError) return { ok: false, error: error.message };
  return { ok: false, error: "The action could not be completed." };
}

export async function practiceSkillAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const skillId = String(formData.get("skillId") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, await clientKey("practice", user.id), 30, 10 * 60 * 1000);
      return practiceSkill(sql, user.id, skillId);
    });
    refreshProgression();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function spendSkillPointAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const skillId = String(formData.get("skillId") ?? "");
  try {
    const message = await withTransaction(async (sql) => spendSkillPoint(sql, user.id, skillId));
    refreshProgression();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function unlockSkillNodeAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const nodeId = String(formData.get("nodeId") ?? "");
  try {
    const message = await withTransaction(async (sql) => unlockSkillNode(sql, user.id, nodeId));
    refreshProgression();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function missionAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const missionId = String(formData.get("missionId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, await clientKey("mission", user.id), 40, 10 * 60 * 1000);
      if (intent === "accept") return acceptMission(sql, user.id, missionId);
      if (intent === "population") return submitPopulation(sql, user.id, missionId, String(formData.get("answer") ?? ""));
      if (intent === "introduction") return submitIntroduction(sql, user.id, missionId, String(formData.get("note") ?? ""));
      if (intent === "deliver") return deliverShipment(sql, user.id, missionId);
      throw new ProgressionError("That mission action is not recognized.");
    });
    refreshProgression();
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}
