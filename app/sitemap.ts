import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const PUBLIC_ROUTES = ["", "/features", "/pricing", "/security", "/faq", "/contact", "/privacy", "/terms", "/login", "/signup"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.6,
  }));
}
