import { redirect } from "next/navigation";
import { PoliticsIndex } from "@/components/politics/PoliticsIndex";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { politicsIndex } from "@/lib/politics/queries";

export default async function PoliticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = await politicsIndex(await getSql());
  return (
    <section className="max-w-3xl space-y-4">
      <div>
        <p className="kicker">Institutions</p>
        <h1 className="page-title">Politics</h1>
        <p className="text-sm text-muted">
          Leaders and parties below are players in this game. A blank row means no game constitution has been adopted. Real-world governments are not listed as if they were players.
        </p>
      </div>
      <PoliticsIndex rows={rows} />
    </section>
  );
}
