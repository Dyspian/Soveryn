import Link from "next/link";
import { redirect } from "next/navigation";
import { SkillList } from "@/components/progression/SkillList";
import { SkillTree } from "@/components/progression/SkillTree";
import { loadSkillTree } from "@/lib/progression/service";
import { XpBar } from "@/components/progression/XpBar";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { loadCharacterSheet } from "@/lib/progression/service";

export default async function SkillsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const sheet = await loadCharacterSheet(sql, user.id);
  if (!sheet) redirect("/create");
  const nodes = await loadSkillTree(sql, user.id);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Progression</p>
          <h1 className="page-title">Skills</h1>
          <p className="text-muted">{sheet.specializationTitle} · {sheet.skillPoints} skill {sheet.skillPoints === 1 ? "point" : "points"}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted">{sheet.specializationSummary}</p>
        </div>
        <Link href="/missions" className="text-sm text-gold">
          Missions
        </Link>
      </div>
      <XpBar level={sheet.level} into={sheet.xpInto} span={sheet.xpSpan} />
      <SkillTree nodes={nodes} skillPoints={sheet.skillPoints} />
      {sheet.skills.length === 0 ? <p className="text-muted">No skills are recorded for this character.</p> : (
        <SkillList
          skills={sheet.skills}
          skillPoints={sheet.skillPoints}
          practiceUntil={sheet.practiceUntil}
          practiceSkillXp={sheet.practiceSkillXp}
          practiceCharacterXp={sheet.practiceCharacterXp}
        />
      )}
    </section>
  );
}
