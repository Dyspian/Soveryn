import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { loadShellStatus } from "@/lib/game/shell";
import { loadNoticeFeed } from "@/lib/organizations/queries";
import { ensureDatabase } from "@/lib/ready";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOVERYN",
  description: "A persistent sandbox on a real-world map.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabase();
  const user = await getCurrentUser();
  const sql = user?.characterId ? await getSql() : null;
  const [shell, notices] = sql && user?.characterId
    ? await Promise.all([loadShellStatus(sql, user.id), loadNoticeFeed(sql, user.characterId)])
    : [null, null];
  return (
    <html lang="en">
      <body>
        <AppShell user={user} shell={shell} notices={notices}>{children}</AppShell>
      </body>
    </html>
  );
}
