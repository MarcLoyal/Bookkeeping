import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { getJournalEntry } from "@/lib/data/journal";
import { deleteJournalEntry } from "@/lib/data/post-transaction";

/**
 * Delete path for any draft entry (any book) — unlike edit, deletion needs
 * no book-specific form, so this isn't scoped to General Journal the way
 * the edit route is. Checked here for a clean error; RLS
 * (journal_entries_delete, 009_team_roles_rls.sql) plus the immutability
 * trigger (enforce_journal_entry_immutability, 001) are the real backstop —
 * "posted entries stay locked" is true at the database level regardless of
 * anything in this route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "encoder"]);
  if ("response" in auth) return auth.response;
  const { id: clientId, entryId } = await params;

  const entry = await getJournalEntry(auth.user.id, clientId, entryId);
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  if (entry.status !== "draft") {
    return NextResponse.json({ error: "Only a draft entry can be deleted." }, { status: 400 });
  }
  const canDelete = auth.user.role === "firm_admin" || auth.user.role === "bookkeeper" || entry.createdBy === auth.user.id;
  if (!canDelete) {
    return NextResponse.json({ error: "You can only delete your own drafts." }, { status: 403 });
  }

  try {
    await deleteJournalEntry(auth.user.id, entryId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete entry." }, { status: 400 });
  }
}
