import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { postCashReceipt } from "@/lib/data/post-transaction";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  contactId: z.string().uuid().optional(),
  date: z.string().min(1),
  particulars: z.string().min(1),
  bankCashAccountCode: z.string().min(1),
  referenceNo: z.string().optional(),
  allocations: z
    .array(z.object({ accountCode: z.string().min(1), amount: z.string().min(1), memo: z.string().optional() }))
    .min(1),
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
    const allocations = parsed.data.allocations.map((a) => ({
      accountCode: a.accountCode,
      amountCentavos: pesosToCentavos(a.amount),
      memo: a.memo,
    }));
    const totalCentavos = allocations.reduce((s, a) => s + a.amountCentavos, 0n);

    const entryId = await postCashReceipt(auth.user.id, {
      clientId,
      contactId: parsed.data.contactId || undefined,
      receiptDate: parsed.data.date,
      particulars: parsed.data.particulars,
      bankCashAccountCode: parsed.data.bankCashAccountCode,
      referenceNo: parsed.data.referenceNo,
      totalCentavos,
      allocations,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post cash receipt." },
      { status: 400 }
    );
  }
}
