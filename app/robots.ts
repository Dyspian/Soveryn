import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site/origin";

const privatePrefixes = [
  "/admin",
  "/api/",
  "/account",
  "/businesses",
  "/character",
  "/characters",
  "/create",
  "/dashboard",
  "/events",
  "/inventory",
  "/jobs",
  "/later",
  "/map",
  "/market",
  "/missions",
  "/organizations",
  "/politics",
  "/resources",
  "/skills",
];

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin(process.env.SITE_URL);
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePrefixes },
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).toString() } : {}),
  };
}
