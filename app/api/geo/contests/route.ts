import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { placeContest } from "@/lib/organizations/contests";
import { ensureDatabase } from "@/lib/ready";

export async function GET(request: Request) {
  await ensureDatabase();
  const placeId = new URL(request.url).searchParams.get("place");
  if (!placeId || !/^[0-9a-f-]{36}$/i.test(placeId)) return NextResponse.json({ contest: null });
  const sql = await getSql();
  const contest = await placeContest(sql, placeId);
  return NextResponse.json({
    contest,
    note: "A city contest records organization presence. It does not change the country or draw a border.",
  });
}
