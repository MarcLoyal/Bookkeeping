import "server-only";
import { and, eq, isNull, lte, or, gte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { taxRules } from "@/db/schema";

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
