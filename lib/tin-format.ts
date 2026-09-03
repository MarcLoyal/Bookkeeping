/**
 * Client-side convenience only — as the user types digits, inserts dashes at
 * the same positions the server-side format requires (see each Route
 * Handler's `tin` Zod regex: `000-000-000-00000`). The server regex remains
 * the actual source of truth; this just saves the user from typing dashes.
 */
export function formatTin(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 14)];
  return parts.filter(Boolean).join("-");
}
