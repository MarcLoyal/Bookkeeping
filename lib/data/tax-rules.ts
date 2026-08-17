import "server-only";
import { and, asc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { taxRules } from "@/db/schema";

/** Every tax_rules row, for the admin listing (rule #6 — rates/thresholds live here, never hardcoded). */
export async function listTaxRules(userId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(taxRules).orderBy(asc(taxRules.key), asc(taxRules.effectiveFrom))
  );
}

/** Current value for a tax_rules key, as-of `asOfDate` (default today). Never hardcode a rate literal — always go through this. */
export async function getCurrentTaxRule(userId: string, key: string, asOfDate?: string): Promise<string | null> {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);
  return withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select({ value: taxRules.value })
      .from(taxRules)
      .where(
        and(
          eq(taxRules.key, key),
          lte(taxRules.effectiveFrom, date),
          or(isNull(taxRules.effectiveTo), gte(taxRules.effectiveTo, date))
        )
      )
      .limit(1);
    return row?.value ?? null;
  });
}
