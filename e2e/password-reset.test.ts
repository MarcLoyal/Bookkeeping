/**
 * End-to-end walkthrough of the forgot-password / reset-password flow:
 * request a reset for a seeded user, pull the link out of the dev email
 * outbox (see lib/email/send.ts — DEV_EMAIL_OUTBOX_PATH must be set on the
 * running server), set a new password, confirm the old password no longer
 * works and the new one does, and confirm the reset invalidated any session
 * that was active before it (tokenVersion bump — see lib/auth/current-user.ts).
 *
 * Requires the app server running with DEV_EMAIL_OUTBOX_PATH set (see
 * README) and the seeded demo DB. Run with `pnpm test:e2e`.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const OUTBOX_PATH = process.env.DEV_EMAIL_OUTBOX_PATH;
const EMAIL = "reviewer@keepbooks.demo";
const OLD_PASSWORD = "password123";
const NEW_PASSWORD = "a-new-password-123";

let browser: Browser;

beforeAll(async () => {
  if (!OUTBOX_PATH) {
    throw new Error("DEV_EMAIL_OUTBOX_PATH is not set — start the server with it set (see README).");
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
}, 60000);

afterAll(async () => {
  await browser?.close();
});

function latestResetUrlFor(email: string): string {
  const lines = readFileSync(OUTBOX_PATH!, "utf-8").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const entry = JSON.parse(lines[i]);
    if (entry.to === email && entry.subject.includes("Reset your")) {
      const match = entry.text.match(/(https?:\/\/\S+\/reset-password\?token=\S+)/);
      if (match) return match[1];
    }
  }
  throw new Error(`No reset email found for ${email} in outbox`);
}

async function login(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('form button[type="submit"]').last().click();
  await Promise.race([
    page.waitForURL("**/dashboard").then(() => true),
    page.waitForSelector("form p.text-red-600").then(() => false),
  ]);
  return page.url().includes("/dashboard");
}

describe("password reset end-to-end", () => {
  let restoreContext: BrowserContext;
  let restorePage: Page;

  it("logs in, then requests + completes a password reset with the new password", async () => {
    restoreContext = await browser.newContext();
    restorePage = await restoreContext.newPage();

    // Establish a pre-reset session to prove it gets invalidated later.
    const loggedIn = await login(restorePage, EMAIL, OLD_PASSWORD);
    expect(loggedIn).toBe(true);

    const formPage = await browser.newPage();
    await formPage.goto(`${BASE_URL}/forgot-password`, { waitUntil: "networkidle" });
    await formPage.fill("#email", EMAIL);
    await formPage.locator('form button[type="submit"]').click();
    await formPage.waitForSelector("text=/check your email|If that email matches/i");

    const resetUrl = latestResetUrlFor(EMAIL);
    await formPage.goto(resetUrl, { waitUntil: "networkidle" });
    await formPage.fill("#password", NEW_PASSWORD);
    await formPage.locator('form button[type="submit"]').click();
    await formPage.waitForURL("**/login**");
    expect(formPage.url()).toContain("reset=1");
    await formPage.close();
  });

  it("rejects the old password and accepts the new one", async () => {
    const page = await browser.newPage();
    expect(await login(page, EMAIL, OLD_PASSWORD)).toBe(false);
    expect(await login(page, EMAIL, NEW_PASSWORD)).toBe(true);
    await page.close();
  });

  it("invalidated the session that was active before the reset", async () => {
    await restorePage.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    expect(restorePage.url()).toContain("/login");
    await restoreContext.close();
  });
});
