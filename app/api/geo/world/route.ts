import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";
import { countryWorldState } from "@/lib/world/events";

export async function GET(request: Request) {
  await ensureDatabase();
  const iso2 = new URL(request.url).searchParams.get("iso2") ?? "";
  if (!/^[A-Za-z]{2}$/.test(iso2)) return NextResponse.json({ error: "Unknown country." }, { status: 400 });
  const state = await countryWorldState(await getSql(), iso2);
  if (!state) return NextResponse.json({ error: "Unknown country." }, { status: 404 });
  return NextResponse.json({
    state,
    note: "The bulletin and enacted laws are stored country records. They do not change the border.",
  });
}
