import { notFound } from "next/navigation";
import { requireStaffUser } from "@/lib/auth/current-user";
import { listAccounts } from "@/lib/data/accounts";
import { listContacts } from "@/lib/data/contacts";
import { getCurrentTaxRule } from "@/lib/data/tax-rules";
import { SalesInvoiceForm } from "./sales-invoice-form";
import { PurchaseForm } from "./purchase-form";
import { CashForm } from "./cash-form";
import { GeneralJournalForm } from "./general-journal-form";

const TITLES: Record<string, string> = {
  sales_invoice: "New Sales Invoice",
  purchase: "New Purchase",
  cash_receipt: "New Cash Receipt",
  cash_disbursement: "New Cash Disbursement",
  general_journal: "New General Journal Entry",
};

export default async function NewTransactionPage({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const user = await requireStaffUser();
  const { id, type } = await params;
  if (!TITLES[type]) notFound();

  const [accounts, contacts, vatRateStr] = await Promise.all([
    listAccounts(user.id, id),
    listContacts(user.id, id),
    getCurrentTaxRule(user.id, "vat_rate"),
  ]);
  const vatRate = vatRateStr ?? "0"; // decimal string straight from tax_rules — never a literal in code

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold">{TITLES[type]}</h2>

      <div className="mt-4">
        {type === "sales_invoice" && (
          <SalesInvoiceForm clientId={id} contacts={contacts} vatRate={vatRate} />
        )}
        {type === "purchase" && (
          <PurchaseForm clientId={id} contacts={contacts} accounts={accounts} vatRate={vatRate} />
        )}
        {type === "cash_receipt" && (
          <CashForm mode="receipt" clientId={id} contacts={contacts} accounts={accounts} />
        )}
        {type === "cash_disbursement" && (
          <CashForm mode="disbursement" clientId={id} contacts={contacts} accounts={accounts} />
        )}
        {type === "general_journal" && <GeneralJournalForm clientId={id} accounts={accounts} />}
      </div>
    </div>
  );
}
