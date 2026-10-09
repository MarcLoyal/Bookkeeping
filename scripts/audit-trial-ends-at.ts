import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * Read-only audit for the fix that made the platform admin dashboard's
 * expired-trial queue depend on trialEndsAt directly (lib/data/platform-
 * billing.ts) instead of the lazy-set trialExpiredFlaggedAt. That fix is
 * only as good as trialEndsAt itself — this checks every current
 * plan = 'trial' firm's trialEndsAt against what create-firm-for-user.ts
 * sets it to at signup (createdAt + TRIAL_DURATION_DAYS), and reports any
 * mismatch beyond a small clock-skew tolerance. Reports only — never
 * writes anything, per instruction to review flagged firms by hand
 * before touching them.
 *
 * A flagged firm isn't necessarily wrong: setFirmPlan() (lib/billing/
 * set-firm-plan.ts) and extendFirmTrial() (lib/billing/extend-firm-
 * trial.ts) both legitimately move trialEndsAt away from
 * createdAt + 7 days — re-granting a trial starts a fresh clock from the
 * re-grant moment, not from the firm's original signup date, and an
 * extension pushes it further out. This script checks each flagged
 * firm's audit_log for exactly those two action types so you don't have
 * to cross-reference by hand.
 *
 * Usage: pnpm tsx scripts/audit-trial-ends-at.ts
 */

const TRIAL_DURATION_DAYS = 7;
const TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes — generous for a same-request INSERT round trip

async function main() {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const firms = await sql<{ id: string; name: string; created_at: Date; trial_ends_at: Date | null }[]>`
    select id, name, created_at, trial_ends_at
    from firms
    where plan = 'trial'
    order by created_at asc
  `;

  console.log(`Checking ${firms.length} firm(s) currently on the trial plan...\n`);

  if (firms.length === 0) {
    console.log("No trial firms to check.");
    await sql.end();
    return;
  }

  let flaggedCount = 0;

  for (const firm of firms) {
    const expected = new Date(firm.created_at.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    if (firm.trial_ends_at === null) {
      console.log(`✗ ${firm.name} (${firm.id}): trial_ends_at is NULL — should never happen for plan = 'trial'.`);
      flaggedCount++;
      continue;
    }

    const deltaMs = firm.trial_ends_at.getTime() - expected.getTime();
    if (Math.abs(deltaMs) <= TOLERANCE_MS) continue;

    flaggedCount++;
    const deltaDays = (deltaMs / (24 * 60 * 60 * 1000)).toFixed(2);
    console.log(`✗ ${firm.name} (${firm.id})`);
    console.log(`  created_at:        ${firm.created_at.toISOString()}`);
    console.log(`  expected (+7d):    ${expected.toISOString()}`);
    console.log(`  actual trial_ends_at: ${firm.trial_ends_at.toISOString()}`);
    console.log(`  difference: ${deltaDays} day(s) ${deltaMs > 0 ? "later" : "earlier"} than expected`);

    const relevantAudit = await sql<{ action: string; created_at: Date; before: unknown; after: unknown }[]>`
      select action, created_at, before, after
      from audit_log
      where table_name = 'firms' and record_id = ${firm.id} and action in ('TRIAL_EXTENDED', 'PLAN_CHANGE')
      order by created_at asc
    `;
    if (relevantAudit.length > 0) {
      console.log(`  Likely explained by ${relevantAudit.length} audit_log event(s) for this firm:`);
      for (const row of relevantAudit) {
        console.log(`    - ${row.action} at ${row.created_at.toISOString()}`);
      }
    } else {
      console.log("  No TRIAL_EXTENDED/PLAN_CHANGE audit_log row found for this firm — worth a closer look.");
    }
    console.log("");
  }

  console.log(flaggedCount === 0 ? "All trial firms' trial_ends_at matches created_at + 7 days." : `${flaggedCount} firm(s) flagged above. Not modified — review and decide case by case.`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
