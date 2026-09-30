import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createSourceDocument } from "@/lib/data/source-documents";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { extractReceiptData, type ReceiptExtractionResult, type SupportedImageMimeType } from "@/lib/ai/extract-receipt";

const schema = z.object({
  sourceDocumentId: z.string().uuid(),
  storagePath: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/**
 * extractReceiptData()'s money fields are Centavos (bigint) —
 * NextResponse.json() throws on a raw bigint ("Do not know how to
 * serialize a BigInt"), so every one is sent over the wire as its plain
 * decimal-centavos string instead (e.g. "123456", never "1,234.56" —
 * the client converts back via BigInt(str) and formats for display
 * itself, same as every other centavos value already crossing a
 * server/client boundary elsewhere in this app).
 */
type SerializedExtraction =
  | {
      ok: true;
      confidence: "high" | "low";
      vendorName: string | null;
      invoiceDate: string | null;
      totalAmountCentavos: string | null;
      vatBreakdown: {
        vatableSalesCentavos: string | null;
        vatAmountCentavos: string | null;
        vatExemptSalesCentavos: string | null;
        zeroRatedSalesCentavos: string | null;
      } | null;
      notes: string | null;
    }
  | { ok: false; error: string };

function serializeExtraction(extraction: ReceiptExtractionResult): SerializedExtraction {
  if (!extraction.ok) return extraction;
  return {
    ...extraction,
    totalAmountCentavos: extraction.totalAmountCentavos?.toString() ?? null,
    vatBreakdown: extraction.vatBreakdown
      ? {
          vatableSalesCentavos: extraction.vatBreakdown.vatableSalesCentavos?.toString() ?? null,
          vatAmountCentavos: extraction.vatBreakdown.vatAmountCentavos?.toString() ?? null,
          vatExemptSalesCentavos: extraction.vatBreakdown.vatExemptSalesCentavos?.toString() ?? null,
          zeroRatedSalesCentavos: extraction.vatBreakdown.zeroRatedSalesCentavos?.toString() ?? null,
        }
      : null,
  };
}

/**
 * The second half of the AI receipt-capture flow, called after the
 * browser has already uploaded the (already-normalized-to-JPEG, see
 * ReceiptCaptureForm) image straight to Supabase Storage: records the
 * source_documents row, reads the image back from Storage server-side,
 * and runs it through extractReceiptData(). A Route Handler, not a
 * Server Action — same reason draft-journal's route is one (see
 * lib/use-json-post.ts's doc comment): this app's Server Actions can
 * lose the request's session during an internal redirect-streaming
 * pass, and this endpoint is called from exactly that kind of flow
 * (client-side fetch, not a <form action>).
 *
 * Same three roles as every other draft-creating action:
 * firm_admin/bookkeeper unconditionally, encoder scoped to their own
 * upload — enforced independently at three layers (this check, Storage's
 * own receipts_insert policy the upload already had to pass, and
 * source_documents_insert below), not just here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "encoder"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { sourceDocumentId, storagePath, mimeType } = parsed.data;

  try {
    await createSourceDocument(auth.user.id, { id: sourceDocumentId, clientId, storagePath, mimeType });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not record the uploaded document." },
      { status: 400 }
    );
  }

  // The row above is durable regardless of what happens next — a failure
  // from here on is never a reason to lose the upload. Returned as a
  // normal ok:false extraction (still HTTP 200), not an error response:
  // the client's job either way is to open a draft form with this image
  // attached, extraction-prefilled or blank.
  const supabase = await createSupabaseServerClient();
  const { data: fileBlob, error: downloadError } = await supabase.storage.from("receipts").download(storagePath);
  if (downloadError || !fileBlob) {
    console.error("POST /api/clients/[id]/receipts/extract: Storage download failed:", downloadError);
    return NextResponse.json({
      sourceDocumentId,
      extraction: { ok: false, error: "Uploaded, but couldn't read the image back to extract it. You can still fill in the entry manually." },
    });
  }

  const imageBase64 = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");
  const extraction = await extractReceiptData(imageBase64, mimeType as SupportedImageMimeType);

  return NextResponse.json({ sourceDocumentId, extraction: serializeExtraction(extraction) });
}
