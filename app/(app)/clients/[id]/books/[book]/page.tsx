import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getClient, type ClientListRow } from "@/lib/data/clients";
import { listJournalEntries, listLedgerLines } from "@/lib/data/journal";
import { paginateJournalBook, paginateLedgerAccount, type JournalBookLine } from "@/lib/accounting/loose-leaf";
import { formatCentavos } from "@/lib/money";
import { PrintButton } from "../../reports/[report]/print-button";
import Link from "next/link";

const BOOK_TITLES: Record<string, string> = {
  GJ: "General Journal",
  GL: "General Ledger",
  CRB: "Cash Receipts Book",
  CDB: "Cash Disbursements Book",
  SJ: "Sales Journal",
  PJ: "Purchase Journal",
};

const BOOK_TABS = ["GJ", "GL", "CRB", "CDB", "SJ", "PJ"];
const LINES_PER_PAGE = 22;

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; book: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireCurrentUser();
  const { id, book } = await params;
  if (!BOOK_TITLES[book]) notFound();

  const client = await getClient(user.id, id);
  if (!client) notFound();

  const range = await searchParams;
  const { from, to } = { from: range.from || defaultRange().from, to: range.to || defaultRange().to };

  return (
    <div>
      <div className="no-print flex items-center justify-between">
        <h2 className="text-lg font-semibold">{BOOK_TITLES[book]}</h2>
        <form className="flex items-center gap-2 text-sm" action={`/clients/${id}/books/${book}`}>
          <input type="date" name="from" defaultValue={from} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <span className="text-slate-400">to</span>
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100">
            Apply
          </button>
          <PrintButton />
          <a
            href={`/api/clients/${id}/books/${book}/pdf?from=${from}&to=${to}`}
            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            Download PDF
          </a>
        </form>
      </div>

      <nav className="no-print mt-3 flex gap-1 border-b border-slate-200">
        {BOOK_TABS.map((b) => (
          <Link
            key={b}
            href={`/clients/${id}/books/${b}?from=${from}&to=${to}`}
            className={`rounded-t-md px-3 py-2 text-sm font-medium hover:bg-slate-100 ${
              b === book ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-600"
            }`}
          >
            {b}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {book === "GL" ? (
          <GeneralLedgerBook userId={user.id} clientId={id} client={client} from={from} to={to} />
        ) : (
          <JournalStyleBook
            userId={user.id}
            clientId={id}
            client={client}
            book={book as "GJ" | "CRB" | "CDB" | "SJ" | "PJ"}
            from={from}
            to={to}
          />
        )}
      </div>
    </div>
  );
}

function BookHeader({
  client,
  bookTitle,
  from,
  to,
  pageLabel,
}: {
  client: { registeredName: string; tradeName: string | null; tin: string; address: string; ptuNumber: string | null; ptuDate: string | null };
  bookTitle: string;
  from: string;
  to: string;
  pageLabel: string;
}) {
  return (
    <div className="mb-2 border-b border-slate-800 pb-2 text-center text-xs leading-tight">
      <div className="text-sm font-bold uppercase">{client.registeredName}</div>
      {client.tradeName && <div>{client.tradeName}</div>}
      <div>{client.address}</div>
      <div>
        TIN: {client.tin}
        {client.ptuNumber && (
          <>
            {" "}
            · PTU No. {client.ptuNumber}
            {client.ptuDate && ` dated ${client.ptuDate}`}
          </>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
        <span>{bookTitle}</span>
        <span>
          Period: {from} to {to}
        </span>
        <span>{pageLabel}</span>
      </div>
    </div>
  );
}

async function JournalStyleBook({
  userId,
  clientId,
  client,
  book,
  from,
  to,
}: {
  userId: string;
  clientId: string;
  client: ClientListRow;
  book: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
  from: string;
  to: string;
}) {
  const entries = await listJournalEntries(userId, clientId, {
    book,
    dateFrom: from,
    dateTo: to,
    statusIn: ["posted", "reversed"],
  });

  const flatLines: JournalBookLine[] = [];
  for (const e of entries) {
    for (const l of e.lines) {
      flatLines.push({
        entryId: e.id,
        entryNo: e.entryNo,
        entryDate: e.entryDate,
        book: e.book,
        referenceNo: e.referenceNo,
        description: e.description,
        accountCode: l.accountCode ?? "",
        accountName: l.accountName ?? "",
        debitCentavos: l.debitCentavos,
        creditCentavos: l.creditCentavos,
      });
    }
  }

  const pages = paginateJournalBook(flatLines, LINES_PER_PAGE);

  return (
    <div className="space-y-6">
      {pages.map((page) => (
        <div key={page.pageNo} className="print-page rounded-lg border border-slate-200 bg-white p-4">
          <BookHeader
            client={client}
            bookTitle={BOOK_TITLES[book]}
            from={from}
            to={to}
            pageLabel={`Page ${page.pageNo} of ${page.totalPages}`}
          />
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-400 text-left uppercase text-slate-500">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Entry #</th>
                <th className="py-1 pr-2">Account</th>
                <th className="py-1 pr-2">Particulars</th>
                <th className="py-1 pr-2">Ref</th>
                <th className="py-1 pr-2 text-right">Debit</th>
                <th className="py-1 pr-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-300 italic text-slate-500">
                <td colSpan={5} className="py-1 pr-2">
                  Balance brought forward
                </td>
                <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.broughtForwardDebit)}</td>
                <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.broughtForwardCredit)}</td>
              </tr>
              {page.lines.map((l, i) => (
                <tr key={`${l.entryId}-${i}`} className="border-b border-slate-100">
                  <td className="py-1 pr-2">{l.entryDate}</td>
                  <td className="py-1 pr-2 font-mono">{l.entryNo ?? "—"}</td>
                  <td className="py-1 pr-2">
                    {l.accountCode} {l.accountName}
                  </td>
                  <td className="py-1 pr-2">{l.description}</td>
                  <td className="py-1 pr-2 font-mono">{l.referenceNo}</td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {l.debitCentavos > 0n ? formatCentavos(l.debitCentavos) : ""}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {l.creditCentavos > 0n ? formatCentavos(l.creditCentavos) : ""}
                  </td>
                </tr>
              ))}
              {page.lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-400">
                    No entries in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-400 font-semibold">
                <td colSpan={5} className="py-1 pr-2">
                  Balance carried forward
                </td>
                <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.carriedForwardDebit)}</td>
                <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.carriedForwardCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  );
}

async function GeneralLedgerBook({
  userId,
  clientId,
  client,
  from,
  to,
}: {
  userId: string;
  clientId: string;
  client: ClientListRow;
  from: string;
  to: string;
}) {
  const rows = await listLedgerLines(userId, clientId, from, to);

  const byAccount = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byAccount.get(r.accountId) ?? [];
    list.push(r);
    byAccount.set(r.accountId, list);
  }

  const accountPageSets = Array.from(byAccount.entries()).map(([, accountRows]) => {
    const first = accountRows[0];
    return paginateLedgerAccount(
      first.accountCode,
      first.accountName,
      first.normalBalance,
      accountRows.map((r) => ({
        entryId: r.entryId,
        entryNo: r.entryNo,
        entryDate: r.entryDate,
        description: r.description,
        memo: r.memo,
        debitCentavos: r.debitCentavos,
        creditCentavos: r.creditCentavos,
      })),
      LINES_PER_PAGE
    );
  });
  accountPageSets.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  if (accountPageSets.length === 0) {
    return <p className="text-sm text-slate-400">No postings in this period.</p>;
  }

  return (
    <div className="space-y-6">
      {accountPageSets.map((acct) =>
        acct.pages.map((page) => (
          <div key={`${acct.accountCode}-${page.pageNo}`} className="print-page rounded-lg border border-slate-200 bg-white p-4">
            <BookHeader
              client={client}
              bookTitle={`General Ledger — ${acct.accountCode} ${acct.accountName}`}
              from={from}
              to={to}
              pageLabel={`Page ${page.pageNo} of ${page.totalPages}`}
            />
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-400 text-left uppercase text-slate-500">
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Entry #</th>
                  <th className="py-1 pr-2">Particulars</th>
                  <th className="py-1 pr-2 text-right">Debit</th>
                  <th className="py-1 pr-2 text-right">Credit</th>
                  <th className="py-1 pr-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-300 italic text-slate-500">
                  <td colSpan={5} className="py-1 pr-2">
                    Balance brought forward
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.broughtForwardBalance)}</td>
                </tr>
                {(() => {
                  let running = page.broughtForwardBalance;
                  return page.lines.map((l, i) => {
                    const delta =
                      acct.normalBalance === "debit"
                        ? l.debitCentavos - l.creditCentavos
                        : l.creditCentavos - l.debitCentavos;
                    running += delta;
                    return (
                      <tr key={`${l.entryId}-${i}`} className="border-b border-slate-100">
                        <td className="py-1 pr-2">{l.entryDate}</td>
                        <td className="py-1 pr-2 font-mono">{l.entryNo ?? "—"}</td>
                        <td className="py-1 pr-2">{l.description}</td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {l.debitCentavos > 0n ? formatCentavos(l.debitCentavos) : ""}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {l.creditCentavos > 0n ? formatCentavos(l.creditCentavos) : ""}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">{formatCentavos(running)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 font-semibold">
                  <td colSpan={5} className="py-1 pr-2">
                    Balance carried forward
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">{formatCentavos(page.carriedForwardBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
