import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { pesosToCentavos, type Centavos } from "@/lib/money";

/**
 * Pinned to a dated snapshot, not the floating `claude-haiku-4-5` alias —
 * this is a production extraction path, and a silent model swap changing
 * output quality/shape without a code review is exactly the kind of thing
 * pinning avoids. Haiku, not Sonnet/Opus: reading 4-5 fields off one
 * receipt photo doesn't need complex reasoning, and this runs per-image
 * on an ongoing basis — cost-efficiency matters here in a way it wouldn't
 * for a one-off task.
 */
const MODEL = "claude-haiku-4-5-20251001";

export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ExtractedVatBreakdown = {
  vatableSalesCentavos: Centavos | null;
  vatAmountCentavos: Centavos | null;
  vatExemptSalesCentavos: Centavos | null;
  zeroRatedSalesCentavos: Centavos | null;
};

export type ReceiptExtractionResult =
  | {
      ok: true;
      /**
       * "high" only when the image was clear and every filled-in field is
       * unambiguous — the review form built on top of this (a later PR)
       * always opens editable either way, but a "low" result is the
       * signal to visibly flag "double-check this" rather than let it
       * look as trustworthy as a clean read. This function NEVER posts
       * anything itself — confidence only ever informs how a human
       * reviewer's draft is presented, never whether one gets created.
       */
      confidence: "high" | "low";
      vendorName: string | null;
      invoiceDate: string | null; // YYYY-MM-DD
      totalAmountCentavos: Centavos | null;
      vatBreakdown: ExtractedVatBreakdown | null;
      /** Anything a human reviewer should know — what's missing, ambiguous, or why confidence is low. */
      notes: string | null;
    }
  | { ok: false; error: string };

const TOOL_NAME = "record_receipt_extraction";

/**
 * Every field but `confidence` is optional in the schema on purpose — the
 * model is instructed (and structurally permitted) to omit anything it
 * can't read reliably rather than invent a plausible-looking value. A
 * money/date field Claude does return is still validated and can still be
 * discarded below if it turns out malformed; "the model returned it"
 * is never treated as sufficient on its own.
 */
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
        description: 'The total amount due/paid, as a plain decimal number in pesos (e.g. "1234.56") — no currency symbol, no thousands separators.',
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

let cachedClient: Anthropic | null = null;
function getDefaultClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

/**
 * Parses a pesos decimal string the model returned into Centavos. Returns
 * null (never throws) on anything malformed — a field the model got wrong
 * is treated as a field it didn't read, not a reason to fail the whole
 * extraction, but the caller downgrades confidence and notes it either
 * way (see below).
 */
function safeParsePesos(value: string | undefined): Centavos | null {
  if (value === undefined) return null;
  try {
    return pesosToCentavos(value);
  } catch {
    return null;
  }
}

/**
 * Image in, structured extraction out — no DB writes, no journal entry,
 * nothing posted. This is purely a read: PR 3 wires its result into a
 * draft entry a human still has to confirm, and non-negotiable rule #8
 * ("AI extraction never posts directly") holds structurally here, not
 * just by convention — there is nothing in this file capable of writing
 * to the database at all.
 *
 * `client` is injectable so tests never need a real ANTHROPIC_API_KEY or
 * make a real network call — see lib/ai/__tests__/extract-receipt.test.ts.
 */
export async function extractReceiptData(
  imageBase64: string,
  mimeType: SupportedImageMimeType,
  client: Pick<Anthropic, "messages"> = getDefaultClient()
): Promise<ReceiptExtractionResult> {
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
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
  } catch (err) {
    console.error("extractReceiptData: Anthropic API call failed:", err);
    return { ok: false, error: "Could not reach the extraction service. Try again, or enter this receipt manually." };
  }

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!toolUse) {
    console.error("extractReceiptData: no tool_use block in response", { stopReason: response.stop_reason });
    return { ok: false, error: "The extraction service didn't return a usable result." };
  }

  const parsed = toolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("extractReceiptData: tool input failed validation:", parsed.error.issues);
    return { ok: false, error: "The extraction service returned an unexpected result." };
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

  const vatFields = {
    vatableSalesCentavos: safeParsePesos(data.vatableSalesPesos),
    vatAmountCentavos: safeParsePesos(data.vatAmountPesos),
    vatExemptSalesCentavos: safeParsePesos(data.vatExemptSalesPesos),
    zeroRatedSalesCentavos: safeParsePesos(data.zeroRatedSalesPesos),
  };
  const anyVatFieldGiven = [data.vatableSalesPesos, data.vatAmountPesos, data.vatExemptSalesPesos, data.zeroRatedSalesPesos].some(
    (v) => v !== undefined
  );
  const anyVatFieldUnparsed =
    (data.vatableSalesPesos && vatFields.vatableSalesCentavos === null) ||
    (data.vatAmountPesos && vatFields.vatAmountCentavos === null) ||
    (data.vatExemptSalesPesos && vatFields.vatExemptSalesCentavos === null) ||
    (data.zeroRatedSalesPesos && vatFields.zeroRatedSalesCentavos === null);
  if (anyVatFieldUnparsed) {
    confidence = "low";
    notesParts.push("Part of the VAT breakdown wasn't a valid number.");
  }

  return {
    ok: true,
    confidence,
    vendorName: data.vendorName ?? null,
    invoiceDate,
    totalAmountCentavos,
    vatBreakdown: anyVatFieldGiven ? vatFields : null,
    notes: notesParts.length > 0 ? notesParts.join(" ") : null,
  };
}
