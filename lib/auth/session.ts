import { cookies } from "next/headers";
import { getSql } from "@/lib/db";
import { hashSessionToken, newSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, sessionExpiry } from "@/lib/auth/password";
import type { Sql } from "@/lib/db";

export type SessionUser = {
  id: string;
  email: string;
  role: "player" | "admin";
  characterId: string | null;
  username: string | null;
  termsAccepted: boolean;
  guideDismissed: boolean;
};

export async function createSession(sql: Sql, userId: string): Promise<void> {
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const expires = sessionExpiry();
  await sql.query(
    "insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)",
    [userId, tokenHash, expires.toISOString()],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const sql = await getSql();
    await sql.query("delete from sessions where token_hash = $1", [hashSessionToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    email: string;
    role: "player" | "admin";
    character_id: string | null;
    username: string | null;
    terms_accepted_at: string | null;
    guide_dismissed_at: string | null;
    closed_at: string | null;
  }>(
    `select u.id, u.email, u.role, u.terms_accepted_at, u.closed_at, c.id as character_id, c.username, c.guide_dismissed_at
     from sessions s
     join users u on u.id = s.user_id
     left join characters c on c.user_id = u.id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashSessionToken(token)],
  );
  const row = rows[0];
  if (!row || row.closed_at) return null;
  return {
    id: row.id,
    email: row.email,
    role: accountRole(row.email),
    characterId: row.character_id,
    username: row.username,
    termsAccepted: row.terms_accepted_at !== null,
    guideDismissed: row.guide_dismissed_at !== null,
  };
}

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function accountRole(email: string): "player" | "admin" {
  return adminEmails().has(email.trim().toLowerCase()) ? "admin" : "player";
}
