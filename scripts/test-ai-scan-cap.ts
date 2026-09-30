import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";
import { randomUUID } from "node:crypto";

/**
 * Exercises db/sql/023_ai_scan_plan_limit.sql's enforce_ai_scan_plan_limit()
 * trigger against a real database: fills a firm's source_documents count up
 * to its max_ai_scans_per_month cap with fake rows, then confirms the next
 * insert is rejected with the expected "Monthly AI scan limit reached"
 * message. Inserts directly (not via createSourceDocument() — that's
 * already covered by db/__tests__/source-documents-rls.test.ts's own
 * dedicated fixtures) to prove the trigger itself blocks on the target
 * database's real firm/client/user rows, not a synthetic test fixture.
 *
 * Everything runs inside one transaction that's always rolled back at the
 * end, success or failure — this never leaves fake rows behind, or
 * inflates the target firm's real monthly count for the rest of the month.
 *
 * Usage: pnpm test-ai-scan-cap -- ["Firm Name"]
 * Defaults to "Keep.Books Demo Firm".
 */
class RollbackSentinel extends Error {}

async function main() {
  const [firmName = "Keep.Books Demo Firm"] = process.argv.slice(2).filter((a) => a !== "--");

  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const [firm] = await sql<{ id: string; max_ai_scans_per_month: number }[]>`
    select id, max_ai_scans_per_month from firms where name = ${firmName}
  `;
  if (!firm) {
    console.error(`No firm found named "${firmName}".`);
    await sql.end();
    process.exit(1);
  }

  const [client] = await sql<{ id: string; registered_name: string }[]>`
    select id, registered_name from clients where firm_id = ${firm.id} order by created_at limit 1
  `;
  if (!client) {
    console.error(`Firm "${firmName}" has no clients — nothing to attach a fake scan to.`);
    await sql.end();
    process.exit(1);
  }

  const [uploader] = await sql<{ id: string; email: string }[]>`
    select id, email from users where firm_id = ${firm.id} and active = true order by created_at limit 1
  `;
  if (!uploader) {
    console.error(`Firm "${firmName}" has no active users — nothing to attribute the fake scans to.`);
    await sql.end();
    process.exit(1);
  }

  const [{ count: currentCount }] = await sql<{ count: number }[]>`
    select count(*)::int as count from source_documents sd
    join clients c on c.id = sd.client_id
    where c.firm_id = ${firm.id} and sd.created_at >= date_trunc('month', now())
  `;

  const toInsert = Math.max(0, firm.max_ai_scans_per_month - currentCount);

  console.log(`Firm: ${firmName} (${firm.id})`);
  console.log(`Cap: ${firm.max_ai_scans_per_month} AI scans/month`);
  console.log(`Already counted this month (real rows): ${currentCount}`);
  console.log(`Attaching fake scans to client: ${client.registered_name}`);
  console.log(`Uploading as: ${uploader.email}`);
  console.log(`\nEverything below runs inside one transaction that gets rolled back at the end — no permanent rows.\n`);

  try {
    await sql.begin(async (tx) => {
      for (let i = 0; i < toInsert; i++) {
        await tx`
          insert into source_documents (client_id, storage_path, mime_type, uploaded_by)
          values (${client.id}, ${`test-cap-fill/${randomUUID()}.jpg`}, 'image/jpeg', ${uploader.id})
        `;
      }
      if (toInsert > 0) {
        console.log(`Inserted ${toInsert} fake scan${toInsert === 1 ? "" : "s"} — firm is now at its cap of ${firm.max_ai_scans_per_month} for this month.`);
      } else {
        console.log(`Firm is already at or over its cap from real usage — skipping the fill step.`);
      }

      console.log(`\nInserting one more — this one should be rejected...`);
      try {
        await tx`
          insert into source_documents (client_id, storage_path, mime_type, uploaded_by)
          values (${client.id}, ${`test-cap-overflow/${randomUUID()}.jpg`}, 'image/jpeg', ${uploader.id})
        `;
        console.error(`\nUNEXPECTED: that insert succeeded — the trigger did not block it.`);
        process.exitCode = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("Monthly AI scan limit reached")) {
          console.log(`\nConfirmed — rejected with the expected message:`);
          console.log(`  ${message.split("\n")[0]}`);
        } else {
          console.error(`\nRejected, but NOT with the expected message:`);
          console.error(`  ${message}`);
          process.exitCode = 1;
        }
      }

      throw new RollbackSentinel();
    });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) throw err;
  }

  console.log(`\nTransaction rolled back — the firm's real monthly scan count is unchanged.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
