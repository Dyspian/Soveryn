import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site/origin";

const publicPaths = ["/", "/register", "/login", "/legal"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin(process.env.SITE_URL);
  if (!origin) return [];
  return publicPaths.map((path) => ({ url: new URL(path, origin).toString() }));
}
