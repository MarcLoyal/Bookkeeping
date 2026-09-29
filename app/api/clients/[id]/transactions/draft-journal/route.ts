import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createDraftGeneralJournal } from "@/lib/data/post-transaction";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  entryDate: z.string().min(1),
  description: z.string().min(1),
  referenceNo: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(1),
        debit: z.string().optional(),
        credit: z.string().optional(),
        memo: z.string().optional(),
      })
    )
    .min(2),
});

/** Encoder's "add entry" flow — saves a draft, never posts. firm_admin/bookkeeper may also save a draft to finish later (same as they always could via /drafts, just via a real write path now — see createDraftGeneralJournal's doc comment). Reviewer/viewer excluded: neither may add entries at all. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "encoder"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const lines = parsed.data.lines.map((l) => ({
      accountCode: l.accountCode,
      debitCentavos: l.debit && l.debit.trim() !== "" ? pesosToCentavos(l.debit) : 0n,
      creditCentavos: l.credit && l.credit.trim() !== "" ? pesosToCentavos(l.credit) : 0n,
      memo: l.memo,
    }));

    const entryId = await createDraftGeneralJournal(auth.user.id, {
      clientId,
      entryDate: parsed.data.entryDate,
      description: parsed.data.description,
      referenceNo: parsed.data.referenceNo,
      lines,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save draft." }, { status: 400 });
  }
}
