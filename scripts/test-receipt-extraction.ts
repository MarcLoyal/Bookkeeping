import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatCentavos, pesosToCentavos } from "../lib/money";

/**
 * Manually exercises extractReceiptData() (lib/ai/extract-receipt.ts)
 * against a real receipt/invoice photo and the real ANTHROPIC_API_KEY —
 * reimplemented here as an inline copy rather than imported, because that
 * file starts with `import "server-only"`, which throws unconditionally
 * outside Next.js's own build (confirmed live by every other script in
 * this directory needing the same workaround — see downgrade-firm-to-
 * free.ts's own header comment for the fullest explanation). Keeping
 * "server-only" on the real file is deliberate, not an oversight: it's
 * the same guard every credential-touching file in lib/ has, and this
 * one touches ANTHROPIC_API_KEY.
 *
 * If you ever change extractReceiptData()'s tool schema, prompt, or
 * parsing logic, mirror the change here too, or delete this script once
 * PR 3's real upload flow exists to exercise it end-to-end instead.
 *
 * Entirely read-only against the Anthropic API — no DB connection, no
 * writes anywhere, safe to run as many times as you like. Each call is a
 * small, real charge against the Anthropic API.
 *
 * Usage: pnpm test-receipt-extraction -- <path-to-image>
 */

const MODEL = "claude-haiku-4-5-20251001";
const TOOL_NAME = "record_receipt_extraction";

const MIME_BY_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const extractionTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Records what was read from a Philippine business receipt or invoice photo. Omit any field you cannot read with reasonable confidence — never guess or estimate a value.",
  input_schema: {
    type: "object",
    properties: {
      vendorName: { type: "string", description: "The business name printed on the receipt/invoice." },
      invoiceDate: { type: "string", description: "The transaction date, in YYYY-MM-DD format." },
      totalAmountPesos: {
        type: "string",
        description:
          'The total amount due/paid, as a plain decimal number in pesos (e.g. "1234.56") — no currency symbol, no thousands separators.',
      },
      vatableSalesPesos: { type: "string", description: "VAT-able sales/purchase amount (net of VAT), only if a VAT breakdown is printed." },
      vatAmountPesos: { type: "string", description: "The VAT amount, only if shown as its own line." },
      vatExemptSalesPesos: { type: "string", description: "VAT-exempt sales amount, only if shown." },
      zeroRatedSalesPesos: { type: "string", description: "Zero-rated sales amount, only if shown." },
      confidence: {
        type: "string",
        enum: ["high", "low"],
        description:
          '"high" only if the photo is clear and every field you filled in is unambiguous. "low" if the photo is blurry, cropped, glare-obscured, handwritten, or any field is uncertain.',
      },
      notes: { type: "string", description: "Anything a human reviewer should know — what's missing, what's ambiguous, or why confidence is low." },
    },
    required: ["confidence"],
  },
};

const toolInputSchema = z.object({
  vendorName: z.string().optional(),
  invoiceDate: z.string().optional(),
  totalAmountPesos: z.string().optional(),
  vatableSalesPesos: z.string().optional(),
  vatAmountPesos: z.string().optional(),
  vatExemptSalesPesos: z.string().optional(),
  zeroRatedSalesPesos: z.string().optional(),
  confidence: z.enum(["high", "low"]),
  notes: z.string().optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeParsePesos(value: string | undefined): bigint | null {
  if (value === undefined) return null;
  try {
    return pesosToCentavos(value);
  } catch {
    return null;
  }
}

function formatMoney(value: bigint | null): string {
  return value === null ? "(none)" : `₱${formatCentavos(value)}`;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const imagePath = args[0];
  if (!imagePath) {
    console.error("Usage: pnpm test-receipt-extraction -- <path-to-image>");
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const ext = extname(imagePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[ext];
  if (!mimeType) {
    throw new Error(`Unsupported image extension "${ext}" — expected one of: ${Object.keys(MIME_BY_EXTENSION).join(", ")}`);
  }

  const imageBase64 = readFileSync(imagePath).toString("base64");
  const client = new Anthropic({ apiKey });

  console.log(`\nSending ${imagePath} (${mimeType}) to ${MODEL}...\n`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You read Philippine business receipts and invoices for a bookkeeping app. Extract only what you can clearly read — never guess or estimate a value, and never invent a field that isn't legible.",
    tools: [extractionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: "Extract this receipt/invoice's details using the record_receipt_extraction tool." },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
  );
  if (!toolUse) {
    console.log("No tool_use block in the response — raw content:");
    console.log(JSON.stringify(response.content, null, 2));
    return;
  }

  console.log("Raw tool input from Claude:");
  console.log(JSON.stringify(toolUse.input, null, 2));

  const parsed = toolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.log("\nFailed validation — this itself would be an ok:false result from the real function:");
    console.log(parsed.error.issues);
    return;
  }
  const data = parsed.data;

  const notesParts: string[] = data.notes ? [data.notes] : [];
  let confidence = data.confidence;

  const invoiceDate = data.invoiceDate && DATE_RE.test(data.invoiceDate) ? data.invoiceDate : null;
  if (data.invoiceDate && !invoiceDate) {
    confidence = "low";
    notesParts.push(`Date "${data.invoiceDate}" wasn't in a recognizable format.`);
  }

  const totalAmountCentavos = safeParsePesos(data.totalAmountPesos);
  if (data.totalAmountPesos && totalAmountCentavos === null) {
    confidence = "low";
    notesParts.push(`Total amount "${data.totalAmountPesos}" wasn't a valid number.`);
  }

  const vatableSalesCentavos = safeParsePesos(data.vatableSalesPesos);
  const vatAmountCentavos = safeParsePesos(data.vatAmountPesos);
  const vatExemptSalesCentavos = safeParsePesos(data.vatExemptSalesPesos);
  const zeroRatedSalesCentavos = safeParsePesos(data.zeroRatedSalesPesos);
  if (
    (data.vatableSalesPesos && vatableSalesCentavos === null) ||
    (data.vatAmountPesos && vatAmountCentavos === null) ||
    (data.vatExemptSalesPesos && vatExemptSalesCentavos === null) ||
    (data.zeroRatedSalesPesos && zeroRatedSalesCentavos === null)
  ) {
    confidence = "low";
    notesParts.push("Part of the VAT breakdown wasn't a valid number.");
  }

  console.log("\n=== Parsed result (matches extractReceiptData()'s shape) ===");
  console.log(`confidence:      ${confidence}`);
  console.log(`vendorName:      ${data.vendorName ?? "(none)"}`);
  console.log(`invoiceDate:     ${invoiceDate ?? "(none)"}`);
  console.log(`totalAmount:     ${formatMoney(totalAmountCentavos)}`);
  console.log(`vatableSales:    ${formatMoney(vatableSalesCentavos)}`);
  console.log(`vatAmount:       ${formatMoney(vatAmountCentavos)}`);
  console.log(`vatExemptSales:  ${formatMoney(vatExemptSalesCentavos)}`);
  console.log(`zeroRatedSales:  ${formatMoney(zeroRatedSalesCentavos)}`);
  console.log(`notes:           ${notesParts.length > 0 ? notesParts.join(" ") : "(none)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
