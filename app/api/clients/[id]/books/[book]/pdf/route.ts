import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { apiRequireUser } from "@/lib/auth/api-auth";

const BOOK_TITLES: Record<string, string> = {
  GJ: "General Journal",
  GL: "General Ledger",
  CRB: "Cash Receipts Book",
  CDB: "Cash Disbursements Book",
  SJ: "Sales Journal",
  PJ: "Purchase Journal",
};

/**
 * Server-side loose-leaf PDF export (spec §3: "PDF generation: headless
 * Chromium (Playwright) rendering print-CSS HTML → PDF"). Re-navigates
 * Chromium to the SAME on-screen book route so pagination/BF-CF logic is
 * computed exactly once, in lib/accounting/loose-leaf.ts, forwarding this
 * request's session cookie so the internal render is authenticated the
 * same way the browser's own /clients/.../books/... view is.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; book: string }> }) {
  const auth = await apiRequireUser();
  if ("response" in auth) return auth.response;

  const { id, book } = await params;
  if (!BOOK_TITLES[book]) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const targetUrl = new URL(`/clients/${id}/books/${book}`, req.nextUrl.origin);
  if (from) targetUrl.searchParams.set("from", from);
  if (to) targetUrl.searchParams.set("to", to);

  const cookieHeader = req.headers.get("cookie") ?? "";

  // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH lets a host with a pre-fetched
  // Chromium binary (whose revision may not match this project's installed
  // `playwright` version) point at it explicitly instead of Playwright
  // trying to download a fresh one. Unset in normal deployments — see
  // .env.example.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { cookie: cookieHeader } });
    const page = await context.newPage();
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
      printBackground: true,
    });
    await context.close();

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${id}-${book}-${from || "all"}-${to || "all"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
