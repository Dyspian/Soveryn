import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
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
  return (
    <html lang="en">
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
