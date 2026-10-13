"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/actions/account";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db";
import { quoteJourney, TravelError, departJourney, type TravelQuote } from "@/lib/travel/service";
import { formatUtc } from "@/lib/world/clock";

export type TravelActionResult = ActionResult & { quote?: TravelQuote };

export async function travelAction(_state: TravelActionResult | null, formData: FormData): Promise<TravelActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const placeId = String(formData.get("placeId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "quote") {
      const quote = await withTransaction(async (sql) => {
        await consumeRateLimit(sql, `travel:${user.id}`, 40, 10 * 60 * 1000);
        return quoteJourney(sql, user.id, placeId);
      });
      const arrival = new Date(Date.now() + quote.seconds * 1000);
      return {
        ok: true,
        quote,
        message: `${quote.destinationName}, ${quote.destinationCountry}. About ${quote.distanceKm.toLocaleString("en-US")} km on a straight-line estimate, not a road or flight. Cost ${quote.cost}. Arrival after ${formatUtc(arrival)} if you depart now.`,
      };
    }
    if (intent === "depart") {
      await withTransaction(async (sql) => {
        await consumeRateLimit(sql, `travel:${user.id}`, 40, 10 * 60 * 1000);
        await departJourney(sql, user.id, placeId, String(formData.get("idempotencyKey") ?? ""));
      });
      revalidatePath("/map");
      revalidatePath("/character");
      revalidatePath("/dashboard");
      return { ok: true, message: "The journey has started. This city remains your location until the arrival time." };
    }
    return { ok: false, error: "That travel action is not recognized." };
  } catch (error) {
    if (error instanceof TravelError || error instanceof RateLimitError) return { ok: false, error: error.message };
    return { ok: false, error: "The journey could not be started." };
  }
}
