import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { reverseJournalEntry } from "@/lib/data/post-transaction";

const schema = z.object({
  reversalDate: z.string().min(1),
  reason: z.string().min(1, "A reason is required for the audit trail"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "reviewer"]);
  if ("response" in auth) return auth.response;
  const { id: clientId, entryId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const reversalEntryId = await reverseJournalEntry(
      auth.user.id,
      clientId,
      entryId,
      parsed.data.reversalDate,
      parsed.data.reason
    );
    return NextResponse.json({ reversalEntryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reverse entry." },
      { status: 400 }
    );
  }
}
