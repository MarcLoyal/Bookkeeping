import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { postGeneralJournal } from "@/lib/data/post-transaction";
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "reviewer"]);
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

    const entryId = await postGeneralJournal(auth.user.id, {
      clientId,
      entryDate: parsed.data.entryDate,
      description: parsed.data.description,
      referenceNo: parsed.data.referenceNo,
      lines,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post journal entry." },
      { status: 400 }
    );
  }
}
