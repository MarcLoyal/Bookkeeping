/**
 * End-to-end verification of the payroll engine (Phase 3, payroll subsystem)
 * against a real local Postgres — no UI exists yet, so this is how the
 * engine gets exercised for real before that lands. Reuses the same fixed
 * "Acceptance Test Co." fixture as db/__tests__/acceptance.test.ts.
 *
 * Requires `pnpm db:migrate` and `pnpm seed` first, plus SSS brackets,
 * PhilHealth/Pag-IBIG tax_rules keys, and withholding_tax_brackets to be
 * populated — this app ships the first two empty by design (see
 * DECISIONS.md), so a local dev DB needs them entered once (by hand or via
 * the future admin UI) before this test can run; it's skipped automatically
 * if they're missing rather than failing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { createEmployee, createPayrollRun, getPayrollRunWithPayslips, listPayrollRuns } from "@/lib/data/payroll";
import { formatCentavos, pesosToCentavos } from "@/lib/money";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const TEST_CLIENT_ID = "00000000-0000-4000-8000-000000000001"; // "Acceptance Test Co." — same fixture as acceptance.test.ts
let adminUserId: string;
let hasStatutoryData = false;

beforeAll(async () => {
  const [admin] = await ownerDb.select().from(schema.users).where(eq(schema.users.role, "firm_admin")).limit(1);
  if (!admin) throw new Error("Seed data not found — run `pnpm db:migrate && pnpm seed` first.");
  adminUserId = admin.id;

  const [sss] = await ownerDb.select().from(schema.sssContributionBrackets).limit(1);
  const [wtax] = await ownerDb.select().from(schema.withholdingTaxBrackets).limit(1);
  hasStatutoryData = Boolean(sss && wtax);
}, 30000);

afterAll(async () => {
  await ownerConn.end();
});

describe("payroll engine: employee creation and payroll run posting", () => {
  it("creates an employee, posts a payroll run, and produces a balanced journal entry", async () => {
    if (!hasStatutoryData) {
      console.warn("Skipping — sss_contribution_brackets/withholding_tax_brackets not populated in this dev DB.");
      return;
    }

    const { id: employeeId } = await createEmployee(adminUserId, {
      clientId: TEST_CLIENT_ID,
      registeredName: `Test Employee ${Date.now()}`,
      payFrequency: "monthly",
      basicPayCentavos: pesosToCentavos("35000.00"),
      isMinimumWageEarner: false,
      dateHired: "2024-01-15",
    });

    const { runId, entryId } = await createPayrollRun(adminUserId, {
      clientId: TEST_CLIENT_ID,
      runType: "regular",
      periodStart: "2025-06-01",
      periodEnd: "2025-06-30",
      payDate: "2025-06-30",
      entries: [{ employeeId, deMinimisCentavos: 0n }],
    });
    expect(entryId).toBeTruthy();

    const runs = await listPayrollRuns(adminUserId, TEST_CLIENT_ID);
    const run = runs.find((r) => r.id === runId);
    expect(run).toBeDefined();

    const withPayslips = await getPayrollRunWithPayslips(adminUserId, TEST_CLIENT_ID, run!.id);
    expect(withPayslips!.payslips).toHaveLength(1);
    const payslip = withPayslips!.payslips[0];
    console.log("Computed payslip:", {
      grossTaxableIncome: formatCentavos(payslip.grossTaxableIncomeCentavos),
      withholdingTax: formatCentavos(payslip.withholdingTaxCentavos),
      netPay: formatCentavos(payslip.netPayCentavos),
    });

    // The DB's own double-entry trigger (001_functions_triggers_rls.sql)
    // already re-verified balance at posting time — this just confirms the
    // journal entry actually exists and is posted.
    const [entry] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(entry.status).toBe("posted");
    const lines = await ownerDb.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId));
    const totalDebit = lines.reduce((s, l) => s + l.debitCentavos, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditCentavos, 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBeGreaterThan(0n);
  }, 20000);
});
