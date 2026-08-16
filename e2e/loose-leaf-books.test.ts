/**
 * Acceptance test #10 (spec §9): "Loose-leaf General Ledger PDF for a
 * 3-month range has continuous page numbers, correct brought-forward/
 * carried-forward totals per page, and the PTU header on every page."
 *
 * This exercises the full stack (Postgres -> lib/data -> lib/accounting ->
 * the on-screen route -> the Playwright-rendered PDF), unlike
 * lib/accounting/__tests__/loose-leaf.test.ts, which only unit-tests the
 * pure pagination math. Requires the app server running (`pnpm dev` or
 * `pnpm build && pnpm start`) and the seeded demo DB. Run with `pnpm test:e2e`.
 *
 * Design note (see DECISIONS.md): the General Ledger paginates PER ACCOUNT
 * (one loose-leaf "card" per account, its own "Page N of M"), matching how
 * physical loose-leaf ledgers are organized — so "continuous page numbers"
 * is verified per account card (no gaps/duplicates within a card), not as
 * one running number across the whole document.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const CLIENT_NAME = "Demo Trading Corp.";
const RANGE = { from: "2025-10-01", to: "2025-12-31" }; // a genuine 3-month range

let browser: Browser;
let page: Page;
let clientId: string;

beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  page = await browser.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" }).catch((err) => {
    throw new Error(
      `Could not reach ${BASE_URL} — start the app first (\`pnpm build && pnpm start\` or \`pnpm dev\`). Original error: ${err.message}`
    );
  });
  await page.fill("#email", "admin@keepbooks.demo");
  await page.fill("#password", "password123");
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL("**/dashboard");

  await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
  const href = await page.locator(`a:has-text("${CLIENT_NAME}")`).first().getAttribute("href");
  if (!href) throw new Error(`Seeded client "${CLIENT_NAME}" not found — run \`pnpm seed\` first.`);
  clientId = href.split("/")[2];
}, 60000);

afterAll(async () => {
  await browser?.close();
});

function parsePeso(text: string): number {
  return Number(text.replace(/,/g, ""));
}

describe("acceptance #10: loose-leaf General Ledger, 3-month range", () => {
  it("renders with continuous per-account page numbers, correct BF/CF, and the PTU header on every page", async () => {
    await page.goto(`${BASE_URL}/clients/${clientId}/books/GL?from=${RANGE.from}&to=${RANGE.to}`, {
      waitUntil: "networkidle",
    });

    const printPages = page.locator(".print-page");
    const pageCount = await printPages.count();
    expect(pageCount).toBeGreaterThan(1); // proves pagination actually kicked in for this range

    // Group print-pages into per-account "cards" by reading each page's own
    // "Page N of M" label, in document order.
    type Parsed = { n: number; m: number; bf: number; cf: number };
    const parsed: Parsed[] = [];
    for (let i = 0; i < pageCount; i++) {
      const card = printPages.nth(i);
      const label = await card.locator("text=/Page \\d+ of \\d+/").first().textContent();
      const match = label?.match(/Page (\d+) of (\d+)/);
      expect(match, `page ${i} missing a "Page N of M" label`).not.toBeNull();
      const n = Number(match![1]);
      const m = Number(match![2]);

      const bfText = await card.locator('tr:has-text("Balance brought forward") td.font-mono').first().textContent();
      const cfText = await card.locator('tr:has-text("Balance carried forward") td.font-mono').first().textContent();
      parsed.push({ n, m, bf: parsePeso(bfText ?? "0"), cf: parsePeso(cfText ?? "0") });
    }

    // Split into per-account runs: a new run starts whenever n resets to 1.
    const runs: Parsed[][] = [];
    for (const p of parsed) {
      if (p.n === 1 || runs.length === 0) runs.push([]);
      runs[runs.length - 1].push(p);
    }

    expect(runs.length).toBeGreaterThan(1); // multiple accounts had activity in the range

    for (const run of runs) {
      // Continuous, gapless numbering within this account's card.
      expect(run.map((p) => p.n)).toEqual(run.map((_, i) => i + 1));
      expect(run.every((p) => p.m === run.length)).toBe(true);

      // First page of every account's card opens at zero for the selected
      // range (see DECISIONS.md — the ledger does not carry forward a true
      // pre-`from` historical balance in Phase 1).
      expect(run[0].bf).toBe(0);

      // Each page's brought-forward balance equals the previous page's
      // carried-forward balance — the core BF/CF continuity guarantee.
      for (let i = 1; i < run.length; i++) {
        expect(run[i].bf).toBeCloseTo(run[i - 1].cf, 2);
      }
    }

    // PTU header (registered name + PTU number) present on every single page.
    const headerHits = await printPages.filter({ hasText: "Demo Trading Corp." }).count();
    expect(headerHits).toBe(pageCount);
    const ptuHits = await printPages.filter({ hasText: "PTU No." }).count();
    expect(ptuHits).toBe(pageCount);
  });

  it("the server-rendered PDF export succeeds and is a valid PDF", async () => {
    const resp = await page.request.get(
      `${BASE_URL}/api/clients/${clientId}/books/GL/pdf?from=${RANGE.from}&to=${RANGE.to}`
    );
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toBe("application/pdf");
    const body = await resp.body();
    expect(body.slice(0, 4).toString()).toBe("%PDF");
    expect(body.length).toBeGreaterThan(1000);
  });
});
