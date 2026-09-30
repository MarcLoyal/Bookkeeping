import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * Manually triggers a Free-plan downgrade from a terminal — the exact
 * same logic as downgradeFirmToFree() (lib/billing/downgrade-firm-to-
 * free.ts), reimplemented here as inline SQL rather than imported,
 * because every function in lib/billing/ starts with `import
 * "server-only"`, which throws unconditionally outside Next.js's own
 * build (confirmed live: importing it from a plain tsx script fails
 * immediately) — the same reason every other script in this directory
 * (create-platform-admin.ts, etc.) reimplements its logic instead of
 * importing from lib/. The real function's correctness is already
 * covered directly by db/__tests__/plan-limits-downgrade.test.ts (which
 * runs under Vitest, where vitest.config.ts aliases "server-only" to a
 * no-op stub) — this script's job is different: let you exercise the
 * same behavior against a real database's real data before the
 * dashboard button (a later PR) exists to click.
 *
 * If you ever change downgradeFirmToFree()'s logic, mirror the change
 * here too, or delete this script once the dashboard button ships —
 * whichever comes first.
 *
 * Destructive: deactivates every non-Owner, non-client_user staff
 * member at the target firm, and demotes all but its 3 most-recently-
 * viewed clients to read-only. Defaults to a DRY RUN — prints exactly
 * what would happen and touches nothing. Pass --yes to actually execute.
 *
 * Usage: pnpm downgrade-firm -- <firmId> <platformAdminEmail> [--yes]
 */
async function main() {
  const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
  const yes = rawArgs.includes("--yes");
  const [firmId, adminEmail] = rawArgs.filter((a) => a !== "--yes");

  if (!firmId || !adminEmail) {
    console.error("Usage: pnpm downgrade-firm -- <firmId> <platformAdminEmail> [--yes]");
    process.exit(1);
  }

  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const [admin] = await sql<{ id: string; role: string }[]>`select id, role from users where email = ${adminEmail}`;
  if (!admin) {
    console.error(`No user found with email ${adminEmail}.`);
    await sql.end();
    process.exit(1);
  }
  if (admin.role !== "platform_admin") {
    console.error(`${adminEmail} is role '${admin.role}', not platform_admin — refusing to attribute this action to a non-admin account.`);
    await sql.end();
    process.exit(1);
  }

  const [firm] = await sql<{ id: string; name: string; plan: string; max_clients: number; max_users: number }[]>`
    select id, name, plan, max_clients, max_users from firms where id = ${firmId}
  `;
  if (!firm) {
    console.error(`No firm found with id ${firmId}.`);
    await sql.end();
    process.exit(1);
  }

  // Mirrors downgradeFirmToFree()'s candidate query exactly.
  const clients = await sql<{ id: string; registered_name: string; last_viewed: Date | null }[]>`
    select c.id, c.registered_name, max(v.last_viewed_at) as last_viewed
    from clients c
    left join user_client_views v on v.client_id = c.id
    where c.firm_id = ${firmId} and c.status in ('onboarding', 'active')
    group by c.id, c.registered_name
    order by max(v.last_viewed_at) desc nulls last, c.created_at desc
  `;
  const staff = await sql<{ id: string; name: string; role: string }[]>`
    select id, name, role from users
    where firm_id = ${firmId} and active = true and role not in ('firm_admin', 'client_user')
  `;

  const FREE_MAX_CLIENTS = 3;
  const keep = clients.slice(0, FREE_MAX_CLIENTS);
  const demote = clients.slice(FREE_MAX_CLIENTS);

  console.log(`\nFirm: ${firm.name} (${firm.id})`);
  console.log(`Current plan: ${firm.plan} (max ${firm.max_clients} clients, ${firm.max_users} users)`);

  console.log(`\nWould KEEP ACTIVE (top ${FREE_MAX_CLIENTS} most recently viewed):`);
  if (keep.length === 0) console.log("  (no active/onboarding clients)");
  keep.forEach((c, i) => {
    const viewed = c.last_viewed ? `viewed ${c.last_viewed.toISOString().slice(0, 10)}` : "never viewed";
    console.log(`  ${i + 1}. ${c.registered_name} (${viewed})`);
  });

  console.log(`\nWould make READ-ONLY (${demote.length}):`);
  demote.forEach((c) => console.log(`  - ${c.registered_name}`));

  console.log(`\nWould DEACTIVATE (${staff.length} staff member${staff.length === 1 ? "" : "s"}):`);
  staff.forEach((s) => console.log(`  - ${s.name} (${s.role})`));

  console.log(`\nFirm would move to: Free plan (3 clients, 1 user, no per-client assignment).`);

  if (!yes) {
    console.log(`\nDry run only — nothing was changed. Re-run with --yes to actually execute.`);
    await sql.end();
    return;
  }

  console.log(`\nExecuting...`);
  await sql.begin(async (tx) => {
    if (demote.length > 0) {
      await tx`update clients set status = 'inactive' where id = any(${demote.map((c) => c.id)})`;
    }
    await tx`
      update firms
      set plan = 'free', max_clients = 3, max_users = 1, per_client_assignment_allowed = false,
          trial_ends_at = null, trial_expired_flagged_at = null
      where id = ${firmId}
    `;
    if (staff.length > 0) {
      await tx`update users set active = false where id = any(${staff.map((s) => s.id)})`;
    }
    await tx`
      insert into audit_log (actor_user_id, action, table_name, record_id, before, after)
      values (
        ${admin.id}, 'PLAN_DOWNGRADE', 'firms', ${firmId},
        ${sql.json({ plan: firm.plan, maxClients: firm.max_clients, maxUsers: firm.max_users })},
        ${sql.json({ plan: "free", maxClients: 3, maxUsers: 1 })}
      )
    `;
  });

  console.log(`\nDone. Kept active: ${keep.map((c) => c.registered_name).join(", ") || "(none)"}.`);
  console.log(`Made read-only: ${demote.length}. Deactivated: ${staff.length}.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
