"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { withTransaction } from "@/lib/db";
import type { ActionResult } from "@/lib/actions/account";
import {
  acceptConnection,
  blockConnection,
  declineConnection,
  removeConnection,
  requestConnection,
  SocialError,
  unblockConnection,
} from "@/lib/social/connections";

function failure(error: unknown): ActionResult {
  if (error instanceof SocialError || error instanceof RateLimitError) return { ok: false, error: error.message };
  return { ok: false, error: "The connection could not be saved." };
}

export async function connectionAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage connections." };
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const intent = String(formData.get("intent") ?? "");
  const username = String(formData.get("username") ?? "");
  try {
    const message = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, `social:${ip}:${user.id}`, 30, 10 * 60 * 1000);
      if (intent === "request") {
        await requestConnection(sql, { userId: user.id, username });
        return "The connection request was sent.";
      }
      if (intent === "accept") {
        await acceptConnection(sql, { userId: user.id, username });
        return "The connection was accepted.";
      }
      if (intent === "decline") {
        await declineConnection(sql, { userId: user.id, username });
        return "The request was declined.";
      }
      if (intent === "remove") {
        await removeConnection(sql, { userId: user.id, username });
        return "The connection was removed.";
      }
      if (intent === "block") {
        await blockConnection(sql, { userId: user.id, username });
        return "Contact from that character is blocked.";
      }
      if (intent === "unblock") {
        await unblockConnection(sql, { userId: user.id, username });
        return "The block was removed.";
      }
      throw new SocialError("That connection action is not recognized.");
    });
    revalidatePath("/character");
    revalidatePath("/characters");
    revalidatePath(`/characters/${username}`);
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}
