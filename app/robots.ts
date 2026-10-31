import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/clients", "/drafts", "/settings", "/onboarding", "/accept-terms", "/api"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
