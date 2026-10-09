/**
 * hasAcceptedCurrentLegalTerms() / recordLegalAcceptance()
 * (lib/data/legal-acceptances.ts), the legal_acceptances RLS behind them
 * (db/sql/024_legal_acceptances_rls.sql), and createFirmForUser()'s own
 * unconditional acceptance-row insert (lib/auth/create-firm-for-user.ts)
 * — the record of who accepted which Terms/Privacy version, and when.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { hasAcceptedCurrentLegalTerms, recordLegalAcceptance } from "@/lib/data/legal-acceptances";
import { createFirmForUser } from "@/lib/auth/create-firm-for-user";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9a00-000000000001";
const USER_A_ID = "00000000-0000-4000-9a00-000000000010";
const USER_B_ID = "00000000-0000-4000-9a00-000000000011";

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values({ id: FIRM_ID, name: "Legal Acceptances Test Firm" }).onConflictDoNothing();
  await ownerDb
    .insert(schema.users)
    .values([
      { id: USER_A_ID, firmId: FIRM_ID, email: `${USER_A_ID}@test.local`, name: "User A", role: "firm_admin" },
      { id: USER_B_ID, firmId: FIRM_ID, email: `${USER_B_ID}@test.local`, name: "User B", role: "bookkeeper" },
    ])
    .onConflictDoNothing();
  await ownerDb.delete(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, USER_A_ID));
  await ownerDb.delete(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, USER_B_ID));
});

afterAll(async () => {
  await ownerConn.end();
});

describe("hasAcceptedCurrentLegalTerms() / recordLegalAcceptance()", () => {
  it("is false for a user with no acceptance row at all", async () => {
    expect(await hasAcceptedCurrentLegalTerms(USER_A_ID)).toBe(false);
  });

  it("becomes true immediately after recording an acceptance for the current version", async () => {
    await recordLegalAcceptance(USER_A_ID);
    expect(await hasAcceptedCurrentLegalTerms(USER_A_ID)).toBe(true);
  });

  it("is false for a row that accepted a DIFFERENT version — not just 'has any row'", async () => {
    await ownerDb.insert(schema.legalAcceptances).values({ userId: USER_B_ID, termsVersion: "0.0-old", privacyVersion: "0.0-old" });
    expect(await hasAcceptedCurrentLegalTerms(USER_B_ID)).toBe(false);

    // Accepting the real current version then flips it true, proving the
    // check really does compare against CURRENT_TERMS_VERSION/
    // CURRENT_PRIVACY_VERSION, not just "anything on file".
    await recordLegalAcceptance(USER_B_ID);
    expect(await hasAcceptedCurrentLegalTerms(USER_B_ID)).toBe(true);
  });

  it("recordLegalAcceptance() writes the exact current version strings", async () => {
    const rows = await ownerDb
      .select()
      .from(schema.legalAcceptances)
      .where(eq(schema.legalAcceptances.userId, USER_A_ID));
    expect(rows[0].termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(rows[0].privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
  });
});

describe("legal_acceptances RLS: strictly self-scoped, append-only", () => {
  it("a user CANNOT see another user's acceptance rows via a direct SELECT", async () => {
    const rows = await withUserContext(USER_A_ID, (tx) => tx.select().from(schema.legalAcceptances));
    expect(rows.every((r) => r.userId === USER_A_ID)).toBe(true);
    expect(rows.some((r) => r.userId === USER_B_ID)).toBe(false);
  });

  it("a user CANNOT insert an acceptance row attributed to someone else", async () => {
    await expect(
      withUserContext(USER_A_ID, (tx) =>
        tx.insert(schema.legalAcceptances).values({ userId: USER_B_ID, termsVersion: "x", privacyVersion: "x" })
      )
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("createFirmForUser() records acceptance unconditionally", () => {
  const NEW_USER_ID = "00000000-0000-4000-9a00-000000000020";

  it("every new signup gets a legal_acceptances row for the current version in the same transaction as the firm/user", async () => {
    // Cleans up a previous run's fixture rather than using onConflict:
    // createFirmForUser() always does plain inserts (a real signup should
    // never collide), so re-running this test against a persistent dev DB
    // needs its own cleanup instead.
    const [existing] = await ownerDb.select({ firmId: schema.users.firmId }).from(schema.users).where(eq(schema.users.id, NEW_USER_ID));
    if (existing?.firmId) await ownerDb.delete(schema.firms).where(eq(schema.firms.id, existing.firmId));
    await ownerDb.delete(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, NEW_USER_ID));
    await ownerDb.delete(schema.users).where(eq(schema.users.id, NEW_USER_ID));

    const firm = await createFirmForUser({
      userId: NEW_USER_ID,
      email: `${NEW_USER_ID}@test.local`,
      name: "New Signup",
      firmName: "Brand New Firm",
      signupMethod: "email",
    });
    expect(firm.id).toBeDefined();

    expect(await hasAcceptedCurrentLegalTerms(NEW_USER_ID)).toBe(true);
    const rows = await ownerDb.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, NEW_USER_ID));
    expect(rows).toHaveLength(1);
  });
});
