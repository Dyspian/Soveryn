import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";
import { ensureWebsiteBackground, websiteAssetBytes, WEBSITE_BACKGROUND_ID } from "@/lib/site/background";

export async function GET() {
  await ensureDatabase();
  const sql = await getSql();
  await ensureWebsiteBackground(sql);
  const rows = await sql.query<{ bytes: unknown; content_type: string }>(
    "select bytes, content_type from website_assets where id = $1",
    [WEBSITE_BACKGROUND_ID],
  );
  const bytes = websiteAssetBytes(rows[0]?.bytes);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": rows[0]?.content_type || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
