/**
 * Shared base URL for absolute links in SEO metadata (sitemap, robots,
 * Open Graph image, metadataBase) — same APP_URL env var and fallback
 * already used by lib/auth/password-reset.ts and
 * lib/auth/create-team-member.ts for the same "need an absolute URL
 * outside the request" problem.
 */
export function getSiteUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}
