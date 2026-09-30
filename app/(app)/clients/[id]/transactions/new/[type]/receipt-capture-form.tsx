"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { GeneralJournalForm } from "./general-journal-form";

type Account = { id: string; code: string; name: string };

type SerializedVatBreakdown = {
  vatableSalesCentavos: string | null;
  vatAmountCentavos: string | null;
  vatExemptSalesCentavos: string | null;
  zeroRatedSalesCentavos: string | null;
};

type SerializedExtraction =
  | {
      ok: true;
      confidence: "high" | "low";
      vendorName: string | null;
      invoiceDate: string | null;
      totalAmountCentavos: string | null;
      vatBreakdown: SerializedVatBreakdown | null;
      notes: string | null;
    }
  | { ok: false; error: string };

const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Draws `file` onto a canvas and re-encodes it as JPEG, downscaled to at
 * most MAX_DIMENSION px on its longest side — keeps the upload and the
 * Anthropic API payload small regardless of how large a phone camera's
 * original photo is. This is also what normalizes an iPhone's default
 * HEIC capture to something Claude's vision API accepts at all (JPEG/
 * PNG/WebP only — HEIC isn't supported): `createImageBitmap` decodes
 * whatever the browser itself can decode, which for Safari/iOS includes
 * HEIC (the OS's own ImageIO framework backs it) but isn't guaranteed on
 * every browser — hence the caller treating a failure here as a real,
 * recoverable failure state (offering "try another photo" / "enter
 * manually") rather than assuming this always succeeds. No new
 * dependency: every API used here (createImageBitmap, canvas,
 * canvas.toBlob) is a standard, widely-supported browser API.
 */
async function normalizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images here.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process this photo."))), "image/jpeg", JPEG_QUALITY);
    });
  } finally {
    bitmap.close();
  }
}

/** Centavos-as-decimal-string (e.g. "123456") -> plain decimal pesos string ("1234.56"), comma-free — the form's debit/credit inputs feed straight into Number(), which a thousands separator would break. */
function centavosToPlainDecimal(value: string): string {
  const n = BigInt(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * The mobile-first entry point for AI receipt/invoice capture: take or
 * choose a photo, upload it, extract what can be read from it, then hand
 * off to the existing GeneralJournalForm (mode "draft") — this never
 * creates or posts anything itself, it only ever prefills a draft the
 * bookkeeper still reviews and saves, same as every other draft. Visible
 * to firm_admin/bookkeeper/encoder (page.tsx gates this at the route
 * level, same as every other transaction type), independently enforced
 * again by Storage's own receipts_insert RLS policy and
 * source_documents_insert — this component has no privileged access of
 * its own beyond what the signed-in user's own session already grants.
 */
export function ReceiptCaptureForm({ clientId, accounts }: { clientId: string; accounts: Account[] }) {
  const [phase, setPhase] = useState<"capture" | "processing" | "ready" | "failed">("capture");
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<SerializedExtraction | null>(null);
  const [sourceDocumentId, setSourceDocumentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setPhase("processing");
    setFailureMessage(null);
    try {
      const jpegBlob = await normalizeToJpeg(file);
      const id = crypto.randomUUID();
      const storagePath = `${clientId}/${id}.jpg`;

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage.from("receipts").upload(storagePath, jpegBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (uploadError) throw new Error(`Couldn't upload this photo: ${uploadError.message}`);

      const res = await fetch(`/api/clients/${clientId}/receipts/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ sourceDocumentId: id, storagePath, mimeType: "image/jpeg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);

      setSourceDocumentId(typeof data.sourceDocumentId === "string" ? data.sourceDocumentId : id);
      setExtraction(data.extraction ?? null);
      setPhase("ready");
    } catch (err) {
      setFailureMessage(err instanceof Error ? err.message : "Something went wrong processing this photo.");
      setPhase("failed");
    }
  }

  function skipToManualEntry() {
    setExtraction(null);
    setSourceDocumentId(null);
    setPhase("ready");
  }

  if (phase === "ready") {
    const initialValues =
      extraction && extraction.ok
        ? {
            entryDate: extraction.invoiceDate ?? "",
            description: extraction.vendorName ? `${extraction.vendorName} — from receipt` : "",
            referenceNo: "",
            lines:
              extraction.totalAmountCentavos !== null
                ? [
                    { accountCode: "", debit: centavosToPlainDecimal(extraction.totalAmountCentavos), credit: "", memo: "" },
                    { accountCode: "", debit: "", credit: centavosToPlainDecimal(extraction.totalAmountCentavos), memo: "" },
                  ]
                : [
                    { accountCode: "", debit: "", credit: "", memo: "" },
                    { accountCode: "", debit: "", credit: "", memo: "" },
                  ],
          }
        : undefined;

    return (
      <div className="space-y-4">
        {extraction && !extraction.ok && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{extraction.error}</div>
        )}
        {extraction && extraction.ok && extraction.confidence === "low" && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Double-check this one</span> — the photo wasn&apos;t fully clear.
            {extraction.notes && ` ${extraction.notes}`}
          </div>
        )}
        {extraction && extraction.ok && extraction.confidence === "high" && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Read clearly — review the details below before saving.
          </div>
        )}
        <GeneralJournalForm
          clientId={clientId}
          accounts={accounts}
          mode="draft"
          initialValues={initialValues}
          sourceDocumentId={sourceDocumentId ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      {phase === "capture" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-slate-600">Take a photo of the receipt or invoice, or choose one from your library.</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Take / Choose Photo
          </button>
          <button type="button" onClick={skipToManualEntry} className="text-xs font-medium text-slate-500 hover:underline">
            Skip — enter manually instead
          </button>
        </div>
      )}
      {phase === "processing" && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-600">
          <p>Reading your receipt…</p>
        </div>
      )}
      {phase === "failed" && (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-red-600">{failureMessage}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setPhase("capture")}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Try another photo
            </button>
            <button
              type="button"
              onClick={skipToManualEntry}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Enter manually instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
