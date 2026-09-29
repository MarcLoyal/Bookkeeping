import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { getJournalEntry } from "@/lib/data/journal";
import { updateDraftGeneralJournal } from "@/lib/data/post-transaction";
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

/**
 * Edit path for a General Journal draft — the only book with a real draft-
 * saving flow (createDraftGeneralJournal's own doc comment). Checked here
 * for a clean error before ever reaching Postgres; RLS + the immutability
 * triggers (journal_entries_update / journal_lines_write, 009_team_roles_
 * rls.sql; enforce_journal_entry_immutability, 001) are the real backstop
 * either way, so a stale/racing request still can't get through even if
 * this check somehow passed against outdated state.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "encoder"]);
  if ("response" in auth) return auth.response;
  const { id: clientId, entryId } = await params;

  const entry = await getJournalEntry(auth.user.id, clientId, entryId);
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  if (entry.status !== "draft") {
    return NextResponse.json({ error: "Only a draft entry can be edited." }, { status: 400 });
  }
  if (entry.book !== "GJ") {
    return NextResponse.json({ error: "Only General Journal drafts can be edited here." }, { status: 400 });
  }
  const canEdit = auth.user.role === "firm_admin" || auth.user.role === "bookkeeper" || entry.createdBy === auth.user.id;
  if (!canEdit) {
    return NextResponse.json({ error: "You can only edit your own drafts." }, { status: 403 });
  }

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

    await updateDraftGeneralJournal(auth.user.id, entryId, {
      clientId,
      entryDate: parsed.data.entryDate,
      description: parsed.data.description,
      referenceNo: parsed.data.referenceNo,
      lines,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save changes." }, { status: 400 });
  }
}
