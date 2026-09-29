import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { findPossibleDuplicateGeneralJournalEntry } from "@/lib/data/journal";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  entryDate: z.string().min(1),
  referenceNo: z.string().optional(),
  lines: z.array(z.object({ debit: z.string().optional() })),
});

/**
 * Read-only pre-submit check — called by GeneralJournalForm before it
 * actually saves a draft or posts, so a possible duplicate can be
 * confirmed away rather than discovered after the fact. Same role set as
 * both the draft and post routes combined: whoever can reach this form
 * can call this check.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "encoder", "reviewer"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const totalDebitCentavos = parsed.data.lines.reduce(
    (sum, l) => sum + (l.debit && l.debit.trim() !== "" ? pesosToCentavos(l.debit) : 0n),
    0n
  );

  const match = await findPossibleDuplicateGeneralJournalEntry(auth.user.id, {
    clientId,
    entryDate: parsed.data.entryDate,
    referenceNo: parsed.data.referenceNo,
    totalDebitCentavos,
  });

  return NextResponse.json({ duplicate: match });
}
