import Link from "next/link";
import { Emblem } from "@/components/brand/Emblem";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user?.characterId) redirect("/dashboard");
  if (user) redirect("/create");

  return (
    <section className="panel mx-auto max-w-3xl py-10">
      <Emblem className="h-14 w-14 text-gold" />
      <p className="mt-6 border border-line bg-obsidian px-4 py-3 text-sm">
        <span className="text-xs tracking-[0.16em] text-warning uppercase">Beta</span>
        <span className="mt-1 block text-ink">The game is in beta. Player progression will be wiped after beta.</span>
      </p>
      <p className="kicker mt-6">Persistent world</p>
      <p className="page-title mt-2">Build your power. Shape your world.</p>
      <p className="mt-4 max-w-2xl text-muted">
        SOVERYN is a persistent multiplayer sandbox. Create one character, choose a real starting city, then use the
        map, missions, businesses, market, politics, and organizations. Deadlines use server time. Politics and
        organizations are fictional game state. Warfare is not in this version.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register" className="btn btn-primary">
          Create an account
        </Link>
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </div>
    </section>
  );
}
