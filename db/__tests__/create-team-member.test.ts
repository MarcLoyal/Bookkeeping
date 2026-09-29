/**
 * Covers the three "this email already has a public.users row somewhere"
 * safety-rule branches in lib/auth/create-team-member.ts — all three
 * return before ever calling the Supabase Admin API, so they're testable
 * here against real Postgres without any Supabase credentials. The
 * fourth case that function handles (an existing Supabase Auth identity
 * with NO profile row anywhere — the actual bug this file's sibling
 * changes fixed) needs the Supabase Admin API (listUsers, signInWithOtp)
 * and isn't covered by an automated test here, the same way
 * lib/auth/invite-platform-admin.ts's own Supabase Admin API calls
 * aren't — this codebase tests DB-level RLS/data-layer boundaries, not
 * Supabase's own SDK behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { createTeamMember } from "../../lib/auth/create-team-member";
import type { CurrentUser } from "../../lib/auth/current-user";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9300-000000000001";
const OTHER_FIRM_ID = "00000000-0000-4000-9300-000000000002";

const OWNER_ID = "00000000-0000-4000-9300-000000000010";
const SAME_FIRM_MEMBER_EMAIL = "cttm-same-firm@test.local";
const OTHER_FIRM_MEMBER_EMAIL = "cttm-other-firm@test.local";
const PLATFORM_ADMIN_EMAIL = "cttm-platform-admin@test.local";

const OWNER: CurrentUser = {
  id: OWNER_ID,
  firmId: FIRM_ID,
  clientId: null,
  email: "cttm-owner@test.local",
  name: "Owner",
  role: "firm_admin",
};

async function upsertUser(id: string, email: string, role: string, firmId: string | null, accessScope: "all" | "assigned" = "all") {
  await ownerDb
    .insert(schema.users)
    .values({ id, firmId, email, name: email, role: role as any, accessScope })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: role as any, firmId, email, accessScope } });
}

beforeAll(async () => {
  await ownerDb
    .insert(schema.firms)
    .values([
      { id: FIRM_ID, name: "CTTM Test Firm" },
      { id: OTHER_FIRM_ID, name: "CTTM Other Firm" },
    ])
    .onConflictDoNothing();

  await upsertUser(OWNER_ID, OWNER.email, "firm_admin", FIRM_ID);
  // "assigned", not the upsertUser default ("all") — Encoder may never be
  // access_scope 'all' (013_role_access_scope_check.sql's CHECK constraint).
  await upsertUser("00000000-0000-4000-9300-000000000011", SAME_FIRM_MEMBER_EMAIL, "encoder", FIRM_ID, "assigned");
  await upsertUser("00000000-0000-4000-9300-000000000012", OTHER_FIRM_MEMBER_EMAIL, "bookkeeper", OTHER_FIRM_ID);
  await upsertUser("00000000-0000-4000-9300-000000000013", PLATFORM_ADMIN_EMAIL, "platform_admin", null);
});

afterAll(async () => {
  await ownerConn.end();
});

describe("createTeamMember: an email that already has a public.users row somewhere", () => {
  it("already a member of THIS firm — refuses with a clear 'already a member' message", async () => {
    // role: "viewer", not "encoder" — Encoder now requires at least one
    // clientId (see the sibling describe block below), which is a
    // different check entirely from the one this test proves. Viewer has
    // no such requirement, so it isolates the email-dedup logic cleanly.
    const result = await createTeamMember(OWNER, { email: SAME_FIRM_MEMBER_EMAIL, name: "Whoever", role: "viewer", clientIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already a member of this firm/i);
  });

  it("already belongs to a DIFFERENT firm — refuses with a clear error, and does not attach", async () => {
    const result = await createTeamMember(OWNER, { email: OTHER_FIRM_MEMBER_EMAIL, name: "Whoever", role: "viewer", clientIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/different firm/i);

    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.email, OTHER_FIRM_MEMBER_EMAIL));
    expect(row.firmId).toBe(OTHER_FIRM_ID);
  });

  it("already registered with no firm at all (platform_admin) — refuses, and does not attach", async () => {
    const result = await createTeamMember(OWNER, { email: PLATFORM_ADMIN_EMAIL, name: "Whoever", role: "viewer", clientIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already registered/i);

    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.email, PLATFORM_ADMIN_EMAIL));
    expect(row.firmId).toBeNull();
    expect(row.role).toBe("platform_admin");
  });

  it("Bookkeeper trying to add a role other than Encoder is refused before any email lookup happens", async () => {
    const bookkeeper: CurrentUser = { ...OWNER, id: "00000000-0000-4000-9300-000000000014", role: "bookkeeper" };
    await upsertUser(bookkeeper.id, "cttm-bookkeeper@test.local", "bookkeeper", FIRM_ID);
    const result = await createTeamMember(bookkeeper, { email: "cttm-brand-new@test.local", name: "Whoever", role: "viewer", clientIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only add encoder/i);
  });
});
