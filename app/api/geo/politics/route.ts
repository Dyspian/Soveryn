import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";

export async function GET(request: Request) {
  await ensureDatabase();
  const iso2 = new URL(request.url).searchParams.get("iso2");
  if (iso2 && !/^[A-Z]{2}$/.test(iso2)) return NextResponse.json({ error: "Unknown country." }, { status: 400 });
  const sql = await getSql();
  const rows = await sql.query<{ iso2: string; templateId: string | null; templateName: string | null; leader: string | null; restricted: boolean | null; relations: number; treaties: number }>(
    `select c.iso2, t.id as "templateId", t.name as "templateName", ch.username as leader, k.opposition_restricted as restricted,
            (select count(*)::int from diplomatic_relations r where r.country_a = c.id or r.country_b = c.id) as relations,
            (select count(*)::int from treaties tr where tr.country_a = c.id or tr.country_b = c.id) as treaties
     from countries c
     left join constitutions k on k.country_id = c.id
     left join government_templates t on t.id = k.template_id
     left join government_offices o on o.constitution_id = k.id and o.is_executive = true
     left join officeholders h on h.office_id = o.id and h.status = 'active'
     left join characters ch on ch.id = h.character_id
     where ($1::text is null or c.iso2 = $1)
     order by c.name`,
    [iso2],
  );
  return NextResponse.json({
    countries: rows,
    highlights: rows.filter((row) => row.templateName).map((row) => row.iso2),
    note: "Highlights show countries with a game constitution. They are not colored by real-world politics.",
  });
}
