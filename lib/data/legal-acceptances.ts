import "server-only";
import { and, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { legalAcceptances } from "@/db/schema";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";

/**
 * Whether this user has a legal_acceptances row matching BOTH current
 * version constants — not just "has ever accepted anything." Bumping
 * either CURRENT_TERMS_VERSION or CURRENT_PRIVACY_VERSION
 * (lib/legal/versions.ts) makes every existing user's most recent
 * acceptance stop matching, which is what re-prompts them.
 */
export async function hasAcceptedCurrentLegalTerms(userId: string): Promise<boolean> {
  return withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select({ id: legalAcceptances.id })
      .from(legalAcceptances)
      .where(
        and(
          eq(legalAcceptances.userId, userId),
          eq(legalAcceptances.termsVersion, CURRENT_TERMS_VERSION),
          eq(legalAcceptances.privacyVersion, CURRENT_PRIVACY_VERSION)
        )
      )
      .limit(1);
    return !!row;
  });
}

/**
 * Records one acceptance event for the current version pair — used by
 * app/accept-terms (existing users re-prompted on next login). New
 * signups record this inside createFirmForUser()'s own authDb
 * transaction instead (see that file), not through this function, since
 * that path bypasses RLS for the same circular-bootstrap reason the
 * users/firms inserts there do.
 */
export async function recordLegalAcceptance(userId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.insert(legalAcceptances).values({
      userId,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
  });
}
