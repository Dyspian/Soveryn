import { redirect } from "next/navigation";
import { JobDesk } from "@/components/economy/JobDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { myEmployment, openJobs, pendingApplications } from "@/lib/economy/queries";

export default async function JobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const [jobs, applications, employment] = await Promise.all([openJobs(sql), pendingApplications(sql, user.id), myEmployment(sql, user.id)]);
  return (
    <section className="max-w-3xl space-y-4">
      <div>
        <p className="kicker">Trade</p>
        <h1 className="page-title">Jobs</h1>
        <p className="text-sm text-muted">
          Apply to another player&apos;s company. After they hire you, work a shift there. The company receives that category&apos;s result, and your posted wage is paid from the company once per UTC day when its balance can cover it. A wage is not paid twice on the same UTC day.
        </p>
      </div>
      <JobDesk jobs={jobs} applications={applications} employment={employment} />
    </section>
  );
}
