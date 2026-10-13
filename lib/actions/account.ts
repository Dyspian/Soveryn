"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accountRole, clearSession, createSession, getCurrentUser } from "@/lib/auth/session";
import { checkLoginPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getSql, withTransaction } from "@/lib/db";
import { AccountError, acceptTerms, closeAccount, dismissGuide } from "@/lib/account/player";
import { characterSchema, closeAccountSchema, loginSchema, parseCapacity, profileSchema, registerSchema, startingStatusSchema } from "@/lib/validation";
import { ProgressionError, provisionNewCharacter } from "@/lib/progression/service";
import type { Specialization } from "@/lib/progression/rules";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function clientKey(prefix: string, extra: string): Promise<string> {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return `${prefix}:${ip}:${extra.toLowerCase()}`;
}

function rethrowRedirect(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

function mapDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("city_country_mismatch")) return "That city is not in the selected country.";
  if (message.includes("city_not_selectable")) return "That city is not open as a starting location.";
  if (message.includes("city_full")) return "That starting city is at its configured capacity.";
  if (message.includes("characters_username_lower_idx")) return "That username is already taken.";
  if (message.includes("characters_user_id_key") || message.includes("already has a character")) {
    return "This account already has a character.";
  }
  if (message.includes("users_email_key") || message.includes("users_email")) return "An account with that email already exists.";
  if (error instanceof RateLimitError) return error.message;
  if (error instanceof AccountError) return error.message;
  return "The action could not be completed.";
}

export async function registerAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email and a password of at least 8 characters." };

  try {
    const email = parsed.data.email.toLowerCase();
    await withTransaction(async (sql) => {
      await consumeRateLimit(sql, `register:account:${email}`, 8, 60 * 60 * 1000);
      const role = accountRole(email);
      const rows = await sql.query<{ id: string }>(
        "insert into users (email, password_hash, role, terms_accepted_at) values ($1, $2, $3, now()) returning id",
        [email, await hashPassword(parsed.data.password), role],
      );
      const userId = rows[0]?.id;
      if (!userId) throw new Error("Could not create the account.");
      await createSession(sql, userId);
    });
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, error: mapDatabaseError(error) };
  }
  redirect("/create");
}

export async function loginAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Enter the email and password for your account." };

  try {
    const email = parsed.data.email.toLowerCase();
    const destination = await withTransaction(async (sql) => {
      await consumeRateLimit(sql, `login:account:${email}`, 20, 60 * 60 * 1000);
      const rows = await sql.query<{ id: string; password_hash: string; role: string; closed_at: string | null }>(
        "select id, password_hash, role, closed_at from users where email = $1",
        [email],
      );
      const user = rows[0];
      const passwordOk = await checkLoginPassword(parsed.data.password, user?.password_hash ?? null);
      if (!user || !passwordOk) throw new Error("invalid_login");
      if (user.closed_at) throw new AccountError("This account is closed.");
      const role = accountRole(email);
      if (user.role !== role) {
        await sql.query("update users set role = $2 where id = $1", [user.id, role]);
      }
      await createSession(sql, user.id);
      const characters = await sql.query<{ id: string }>("select id from characters where user_id = $1", [user.id]);
      return characters.length > 0 ? "/dashboard" : "/create";
    });
    redirect(destination);
  } catch (error) {
    rethrowRedirect(error);
    if (error instanceof Error && error.message === "invalid_login") {
      return { ok: false, error: "The email or password is not correct." };
    }
    return { ok: false, error: mapDatabaseError(error) };
  }
}

export async function acceptTermsAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await withTransaction((sql) => acceptTerms(sql, user.id));
  redirect("/dashboard");
}

export async function dismissGuideAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.characterId) redirect("/create");
  await withTransaction((sql) => dismissGuide(sql, user.id));
  redirect("/dashboard");
}

export async function closeAccountAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = closeAccountSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the confirmation." };

  try {
    await withTransaction(async (sql) => {
      await consumeRateLimit(sql, await clientKey("close", user.id), 5, 60 * 60 * 1000);
      const rows = await sql.query<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
      const stored = rows[0]?.password_hash;
      if (!stored || !(await verifyPassword(parsed.data.password, stored))) {
        throw new AccountError("The password is not correct.");
      }
      await closeAccount(sql, user.id);
    });
    await clearSession();
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, error: mapDatabaseError(error) };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

export async function createCharacterAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.characterId) redirect("/dashboard");

  const parsed = characterSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    biography: formData.get("biography"),
    portraitKey: formData.get("portraitKey"),
    countryIso2: formData.get("countryIso2"),
    placeId: formData.get("placeId"),
    specialization: formData.get("specialization"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the character form." };

  try {
    await withTransaction(async (sql) => {
      await consumeRateLimit(sql, await clientKey("character", user.id), 5, 60 * 60 * 1000);
      const countries = await sql.query<{ id: string }>("select id from countries where iso2 = $1", [
        parsed.data.countryIso2.toUpperCase(),
      ]);
      const countryId = countries[0]?.id;
      if (!countryId) throw new Error("city_not_selectable");
      await provisionNewCharacter(sql, {
        userId: user.id,
        username: parsed.data.username,
        displayName: parsed.data.displayName || null,
        biography: parsed.data.biography || null,
        portraitKey: parsed.data.portraitKey,
        countryId,
        placeId: parsed.data.placeId,
        specialization: parsed.data.specialization as Specialization,
      });
    });
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, error: mapDatabaseError(error) };
  }
  redirect("/dashboard");
}

export async function updateProfileAction(_state: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.characterId) redirect("/login");
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    biography: formData.get("biography"),
    portraitKey: formData.get("portraitKey"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the profile form." };
  try {
    await withTransaction(async (sql) => {
      await consumeRateLimit(sql, await clientKey("profile", user.id), 20, 10 * 60 * 1000);
      await sql.query(
        "update characters set display_name = $2, biography = $3, portrait_key = $4 where user_id = $1",
        [user.id, parsed.data.displayName || null, parsed.data.biography || null, parsed.data.portraitKey],
      );
    });
  } catch (error) {
    return { ok: false, error: mapDatabaseError(error) };
  }
  return { ok: true };
}

export async function updateStartingLocationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const parsed = startingStatusSchema.safeParse({
    placeId: formData.get("placeId"),
    status: formData.get("status"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) redirect("/admin/starting-locations?error=invalid");
  let capacity: number | null;
  try {
    capacity = parseCapacity(parsed.data.capacity);
  } catch {
    redirect("/admin/starting-locations?error=capacity");
  }
  const sql = await getSql();
  await sql.query(
    "update starting_locations set status = $2, capacity = $3, updated_at = now() where place_id = $1",
    [parsed.data.placeId, parsed.data.status, capacity],
  );
  await sql.query(
    `insert into audit_events (actor_user_id, action, entity_type, entity_id, payload)
     values ($1, 'starting_location.update', 'place', $2, $3::jsonb)`,
    [user.id, parsed.data.placeId, JSON.stringify({ status: parsed.data.status, capacity })],
  );
  redirect("/admin/starting-locations?saved=1");
}
