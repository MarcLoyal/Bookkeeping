import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getJournalEntry } from "@/lib/data/journal";
import { listAccounts } from "@/lib/data/accounts";
import { formatCentavos } from "@/lib/money";
import { GeneralJournalForm } from "../../new/[type]/general-journal-form";

/**
 * Edit path for a General Journal draft — the only book with a real draft-
 * saving flow, same scope reasoning as the API route this posts to
 * (app/api/clients/[id]/transactions/[entryId]/edit/route.ts). Anyone who
 * can't reach the form (wrong role, not the creator, not a draft, not GJ)
 * is redirected back to the entry's detail page rather than shown a form
 * they can't actually submit — RLS would reject the save regardless, but a
 * form nobody can use isn't worth rendering.
 */
export default async function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const user = await requireCurrentUser();
  const { id, entryId } = await params;
  const entry = await getJournalEntry(user.id, id, entryId);
  if (!entry) notFound();

  const canEdit =
    entry.status === "draft" &&
    entry.book === "GJ" &&
    (user.role === "firm_admin" || user.role === "bookkeeper" || (user.role === "encoder" && entry.createdBy === user.id));
  if (!canEdit) redirect(`/clients/${id}/transactions/${entryId}`);

  const accounts = await listAccounts(user.id, id);

  return (
    <div className="max-w-3xl">
      <Link href={`/clients/${id}/transactions/${entryId}`} className="text-sm text-slate-500 hover:underline">
        ← Back to Entry
      </Link>
      <h2 className="mt-2 text-lg font-semibold">Edit Draft — General Journal</h2>

      <div className="mt-4">
        <GeneralJournalForm
          clientId={id}
          accounts={accounts}
          mode="edit"
          entryId={entryId}
          initialValues={{
            entryDate: entry.entryDate,
            description: entry.description,
            referenceNo: entry.referenceNo ?? "",
            lines: entry.lines.map((l) => ({
              accountCode: l.accountCode ?? "",
              debit: l.debitCentavos > 0n ? formatCentavos(l.debitCentavos) : "",
              credit: l.creditCentavos > 0n ? formatCentavos(l.creditCentavos) : "",
              memo: l.memo ?? "",
            })),
          }}
        />
      </div>
    </div>
  );
}
