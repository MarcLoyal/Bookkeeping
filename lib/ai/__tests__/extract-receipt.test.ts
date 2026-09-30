/**
 * extractReceiptData() (lib/ai/extract-receipt.ts) — tested entirely
 * against a fake, injected Anthropic client (see `fakeClient` below), so
 * this suite never needs a real ANTHROPIC_API_KEY or makes a real network
 * call. Covers: full/partial extraction, per-field graceful degradation
 * on a malformed value from the model, no-tool-use and API-failure paths.
 * Never asserts anything about posting/DB writes — this function makes
 * none, by construction (no DB import exists in the file at all).
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { extractReceiptData } from "../extract-receipt";

const TOOL_NAME = "record_receipt_extraction";

function fakeClient(content: unknown[]): Pick<Anthropic, "messages"> {
  return {
    messages: {
      create: async () =>
        ({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content,
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        }) as unknown as Anthropic.Message,
    },
  } as unknown as Pick<Anthropic, "messages">;
}

function fakeClientThatThrows(error: Error): Pick<Anthropic, "messages"> {
  return {
    messages: {
      create: async () => {
        throw error;
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
}

function toolUseBlock(input: unknown) {
  return { type: "tool_use", id: "toolu_test", name: TOOL_NAME, input };
}

describe("extractReceiptData()", () => {
  it("returns a full, high-confidence extraction when every field is clean", async () => {
    const client = fakeClient([
      toolUseBlock({
        vendorName: "Mercury Drug Corp",
        invoiceDate: "2026-03-14",
        totalAmountPesos: "1234.56",
        vatableSalesPesos: "1102.29",
        vatAmountPesos: "132.27",
        confidence: "high",
      }),
    ]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBe("high");
    expect(result.vendorName).toBe("Mercury Drug Corp");
    expect(result.invoiceDate).toBe("2026-03-14");
    expect(result.totalAmountCentavos).toBe(123456n);
    expect(result.vatBreakdown).toEqual({
      vatableSalesCentavos: 110229n,
      vatAmountCentavos: 13227n,
      vatExemptSalesCentavos: null,
      zeroRatedSalesCentavos: null,
    });
    expect(result.notes).toBeNull();
  });

  it("omitted fields come back null, not guessed — low confidence, no VAT breakdown given at all", async () => {
    const client = fakeClient([toolUseBlock({ confidence: "low", notes: "Photo is blurry, only the total is legible." })]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBe("low");
    expect(result.vendorName).toBeNull();
    expect(result.invoiceDate).toBeNull();
    expect(result.totalAmountCentavos).toBeNull();
    expect(result.vatBreakdown).toBeNull();
    expect(result.notes).toBe("Photo is blurry, only the total is legible.");
  });

  it("a malformed total amount is dropped to null and downgrades confidence, not thrown away entirely", async () => {
    const client = fakeClient([
      toolUseBlock({ vendorName: "Some Store", totalAmountPesos: "not a number", confidence: "high" }),
    ]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBe("low");
    expect(result.vendorName).toBe("Some Store"); // the one bad field doesn't poison the good ones
    expect(result.totalAmountCentavos).toBeNull();
    expect(result.notes).toMatch(/valid number/);
  });

  it("a malformed date is dropped to null and downgrades confidence", async () => {
    const client = fakeClient([toolUseBlock({ invoiceDate: "March 14", confidence: "high" })]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBe("low");
    expect(result.invoiceDate).toBeNull();
    expect(result.notes).toMatch(/recognizable format/);
  });

  it("a partial VAT breakdown (only some sub-fields given) still returns the object, with the rest null", async () => {
    const client = fakeClient([toolUseBlock({ vatAmountPesos: "50.00", confidence: "high" })]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vatBreakdown).toEqual({
      vatableSalesCentavos: null,
      vatAmountCentavos: 5000n,
      vatExemptSalesCentavos: null,
      zeroRatedSalesCentavos: null,
    });
  });

  it("returns ok:false when the API call itself fails — never throws", async () => {
    const client = fakeClientThatThrows(new Error("connection reset"));
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/could not reach/i);
  });

  it("returns ok:false when the response has no tool_use block", async () => {
    const client = fakeClient([{ type: "text", text: "I can't process this." }]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when the tool input fails validation (missing required confidence)", async () => {
    const client = fakeClient([toolUseBlock({ vendorName: "Some Store" })]);
    const result = await extractReceiptData("base64data", "image/jpeg", client);
    expect(result.ok).toBe(false);
  });

  it("makes no assertion possible about DB writes because it performs none — the module imports no db client at all", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../extract-receipt.ts", import.meta.url), "utf-8"));
    expect(source).not.toMatch(/from ["']@\/db/);
  });
});
