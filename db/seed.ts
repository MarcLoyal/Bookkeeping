import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import {
  accounts,
  cashDisbursementLines,
  cashDisbursements,
  cashReceiptLines,
  cashReceipts,
  clients,
  clientTaxTypes,
  contacts,
  firms,
  journalEntries,
  journalLines,
  purchases,
  salesInvoices,
  taxRules,
  users,
} from "./schema";
import { PH_SME_CHART_OF_ACCOUNTS } from "../lib/accounting/coa-template";
import {
  buildCashDisbursementLines,
  buildCashReceiptLines,
  buildPurchaseLines,
  buildSalesInvoiceLines,
  type LineDraft,
} from "../lib/accounting/posting";
import { pesosToCentavos } from "../lib/money";
import { hashPassword } from "../lib/auth/password";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is not set.");

// Seeds as the schema-owning role, deliberately bypassing RLS — equivalent
// to running a trusted admin/seed script with a Supabase service_role key.
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

// Deterministic PRNG so `pnpm seed` produces the same demo data every time.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260816);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

async function main() {
  const [existingFirm] = await db.select().from(firms).where(eq(firms.name, "Keep.Books Demo Firm"));
  if (existingFirm) {
    console.log("Already seeded (Keep.Books Demo Firm exists). Skipping — seed data is posted and immutable.");
    await client.end();
    return;
  }

  console.log("Seeding tax_rules...");
  await seedTaxRules();

  console.log("Creating firm + users...");
  const [firm] = await db.insert(firms).values({ name: "Keep.Books Demo Firm" }).returning();

  const demoPassword = await hashPassword("password123");
  const [admin] = await db
    .insert(users)
    .values({
      firmId: firm.id,
      email: "admin@keepbooks.demo",
      name: "Marc (Firm Admin)",
      role: "firm_admin",
      passwordHash: demoPassword,
    })
    .returning();
  const [bookkeeper] = await db
    .insert(users)
    .values({
      firmId: firm.id,
      email: "bookkeeper@keepbooks.demo",
      name: "Bea Bookkeeper",
      role: "bookkeeper",
      passwordHash: demoPassword,
    })
    .returning();
  const [reviewer] = await db
    .insert(users)
    .values({
      firmId: firm.id,
      email: "reviewer@keepbooks.demo",
      name: "Rey Reviewer",
      role: "reviewer",
      passwordHash: demoPassword,
    })
    .returning();

  console.log("Creating demo clients...");
  const [tradingCorp] = await db
    .insert(clients)
    .values({
      firmId: firm.id,
      registeredName: "Demo Trading Corp.",
      tradeName: "Demo Trading",
      tin: "123-456-789-00000",
      rdoCode: "044",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      accountingMethod: "accrual",
      booksType: "loose_leaf",
      ptuNumber: "PTU-2025-000123",
      ptuDate: "2025-01-15",
      topWithholdingAgent: true,
      withholdingAgent: true,
      address: "123 Commerce St., Quezon City, Metro Manila",
      contact: { phone: "0917-000-0001", email: "accounting@demotrading.ph" },
      status: "active",
      onboardedAt: new Date(),
    })
    .returning();

  const [servicesSoleProp] = await db
    .insert(clients)
    .values({
      firmId: firm.id,
      registeredName: "Demo Services (Sole Prop)",
      tradeName: "Demo Services",
      tin: "987-654-321-00000",
      rdoCode: "039",
      taxpayerType: "sole_prop",
      vatStatus: "non_vat",
      incomeTaxRegime: "eight_percent",
      accountingMethod: "accrual",
      booksType: "loose_leaf",
      ptuNumber: "PTU-2025-000456",
      ptuDate: "2025-02-01",
      address: "45 Service Ave., Makati City, Metro Manila",
      contact: { phone: "0917-000-0002", email: "owner@demoservices.ph" },
      status: "active",
      onboardedAt: new Date(),
    })
    .returning();

  await db.insert(clientTaxTypes).values([
    { clientId: tradingCorp.id, formCode: "2550Q", filingFrequency: "quarterly" },
    { clientId: tradingCorp.id, formCode: "1702Q", filingFrequency: "quarterly" },
    { clientId: tradingCorp.id, formCode: "1601-EQ", filingFrequency: "quarterly" },
    { clientId: servicesSoleProp.id, formCode: "2551Q", filingFrequency: "quarterly" },
    { clientId: servicesSoleProp.id, formCode: "1701Q", filingFrequency: "quarterly" },
  ]);

  console.log("Seeding chart of accounts for both clients...");
  const tradingAccounts = await seedChartOfAccounts(tradingCorp.id);
  const servicesAccounts = await seedChartOfAccounts(servicesSoleProp.id);

  console.log("Seeding contacts...");
  const tradingContacts = await seedContacts(tradingCorp.id, tradingAccounts, "Trading");
  const servicesContacts = await seedContacts(servicesSoleProp.id, servicesAccounts, "Services");

  console.log("Seeding ~120 transactions for Demo Trading Corp. (VAT)...");
  await seedTransactions({
    clientId: tradingCorp.id,
    accounts: tradingAccounts,
    contacts: tradingContacts,
    isVat: true,
    postedBy: admin.id,
  });

  console.log("Seeding ~120 transactions for Demo Services (Non-VAT, 8%)...");
  await seedTransactions({
    clientId: servicesSoleProp.id,
    accounts: servicesAccounts,
    contacts: servicesContacts,
    isVat: false,
    postedBy: admin.id,
  });

  console.log("\nSeed complete.\n");
  console.log("Demo logins (password: password123):");
  console.log(`  firm_admin  -> ${admin.email}`);
  console.log(`  bookkeeper  -> ${bookkeeper.email}`);
  console.log(`  reviewer    -> ${reviewer.email}`);

  await client.end();
}

async function seedTaxRules() {
  // Seeded values are a STARTING POINT requiring CPA verification (spec §5.1) —
  // never treat these as authoritative without checking current BIR issuances.
  const asOf = "2024-01-01"; // EOPT Act (RA 11976 / RR 3-2024) effectivity
  await db.insert(taxRules).values([
    { key: "vat_rate", value: "0.12", effectiveFrom: asOf, notes: "Standard VAT rate under the NIRC as amended." },
    { key: "percentage_tax_rate", value: "0.01", effectiveFrom: asOf, notes: "Percentage tax rate per RR 4-2024 (reverted from CREATE Act's temporary 1%; VERIFY current rate before filing)." },
    { key: "ewt_professional_fees_rate", value: "0.10", effectiveFrom: asOf, notes: "ATC WI010/WC010 — individual payee, income payments <= 3M/yr threshold not modeled yet." },
    { key: "ewt_rentals_rate", value: "0.05", effectiveFrom: asOf, notes: "ATC WC100 — rentals of real/personal property." },
    { key: "ewt_goods_rate", value: "0.01", effectiveFrom: asOf, notes: "ATC WC160 — goods, top withholding agents." },
    { key: "ewt_services_rate", value: "0.02", effectiveFrom: asOf, notes: "ATC WC157 — services, top withholding agents." },
    { key: "eight_percent_rate", value: "0.08", effectiveFrom: asOf, notes: "8% income tax option rate (RA 10963/TRAIN), in lieu of percentage tax + graduated income tax." },
    { key: "eight_percent_threshold_annual", value: "250000.00", effectiveFrom: asOf, notes: "First P250,000 of gross sales/receipts exempt under the 8% option." },
    { key: "vat_registration_threshold_annual", value: "3000000.00", effectiveFrom: asOf, notes: "Mandatory VAT registration threshold." },
  ]);
}

async function seedChartOfAccounts(clientId: string): Promise<Record<string, string>> {
  const codeToId: Record<string, string> = {};
  for (const entry of PH_SME_CHART_OF_ACCOUNTS) {
    const [row] = await db
      .insert(accounts)
      .values({
        clientId,
        code: entry.code,
        name: entry.name,
        type: entry.type,
        normalBalance: entry.normalBalance,
        fsLineMapping: entry.fsLineMapping,
      })
      .returning();
    codeToId[entry.code] = row.id;
  }
  return codeToId;
}

const CUSTOMER_NAMES = [
  "Northgate Retailers Inc.", "Sunrise Hardware Supply", "Pacific Rim Traders",
  "Golden Harvest Grocers", "Metro Fastener Co.", "BlueWave Logistics",
  "Everbright Electronics", "Coastal Furniture Mart", "Summit Office Solutions",
  "Riverside Auto Parts",
];
const SUPPLIER_NAMES = [
  "AgriSource Wholesale", "PrimeTech Distributors", "Landmark Office Supplies",
  "CityLink Freight Services", "Apex Professional Services",
];

async function seedContacts(
  clientId: string,
  acctIds: Record<string, string>,
  tag: string
): Promise<{ customers: string[]; suppliers: string[] }> {
  const customers: string[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    const [row] = await db
      .insert(contacts)
      .values({
        clientId,
        type: "customer",
        registeredName: `${name} (${tag})`,
        tin: `10${i}-${randInt(100, 999)}-${randInt(100, 999)}-00000`,
        address: `${randInt(1, 999)} Sample St., Metro Manila`,
        vatStatus: "vat",
        defaultAccountId: acctIds["1030"],
      })
      .returning();
    customers.push(row.id);
  }
  const suppliers: string[] = [];
  for (const [i, name] of SUPPLIER_NAMES.entries()) {
    const [row] = await db
      .insert(contacts)
      .values({
        clientId,
        type: "supplier",
        registeredName: `${name} (${tag})`,
        tin: `20${i}-${randInt(100, 999)}-${randInt(100, 999)}-00000`,
        address: `${randInt(1, 999)} Supply Ave., Metro Manila`,
        vatStatus: "vat",
        defaultAccountId: acctIds["2010"],
      })
      .returning();
    suppliers.push(row.id);
  }
  return { customers, suppliers };
}

/** Inserts a draft entry + lines, then posts it (assigns gapless entry_no, flips status). Mirrors the flow the app's server actions use. */
async function postEntry(params: {
  clientId: string;
  book: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
  entryDate: string;
  description: string;
  referenceNo?: string;
  lines: LineDraft[];
  postedBy: string;
}): Promise<string> {
  const [entry] = await db
    .insert(journalEntries)
    .values({
      clientId: params.clientId,
      book: params.book,
      entryDate: params.entryDate,
      description: params.description,
      referenceNo: params.referenceNo,
      status: "draft",
      createdBy: params.postedBy,
    })
    .returning();

  await db.insert(journalLines).values(
    params.lines.map((l, i) => ({
      entryId: entry.id,
      lineNo: i + 1,
      accountId: l.accountId,
      debitCentavos: l.debitCentavos,
      creditCentavos: l.creditCentavos,
      memo: l.memo,
      contactId: l.contactId,
    }))
  );

  const [{ next }] = (await db.execute(
    sql`select assign_client_entry_no(${params.clientId}) as next`
  )) as unknown as { next: number }[];

  await db
    .update(journalEntries)
    .set({ status: "posted", entryNo: next, postedBy: params.postedBy, postedAt: new Date() })
    .where(eq(journalEntries.id, entry.id));

  return entry.id;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Three quarters ending with the last fully-closed quarter before "today". */
function demoQuarterMonths(): Date[] {
  // Q4 2025, Q1 2026, Q2 2026 — 9 months, Oct 2025 through Jun 2026.
  const months: Date[] = [];
  for (let m = 0; m < 9; m++) {
    months.push(new Date(Date.UTC(2025, 9 + m, 1))); // month 9 = October (0-indexed)
  }
  return months;
}

async function seedTransactions(opts: {
  clientId: string;
  accounts: Record<string, string>;
  contacts: { customers: string[]; suppliers: string[] };
  isVat: boolean;
  postedBy: string;
}) {
  const { clientId, accounts: a, contacts: c, isVat, postedBy } = opts;
  const months = demoQuarterMonths();

  let invoiceSeq = 1;
  let supplierInvSeq = 1;
  let receiptSeq = 1;
  let disbSeq = 1;

  for (const monthStart of months) {
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();

    // ~5-6 sales invoices/month
    const invoicesThisMonth = randInt(5, 6);
    const monthInvoiceEntryIds: { entryId: string; contactId: string; total: bigint; invoiceId: string }[] = [];
    for (let i = 0; i < invoicesThisMonth; i++) {
      const day = randInt(1, daysInMonth);
      const date = isoDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day)));
      const netSale = pesosToCentavos(String(randInt(5000, 60000)) + ".00");
      const vat = isVat ? (netSale * 12n) / 100n : 0n;
      const total = netSale + vat;
      const contactId = pick(c.customers);
      const invoiceNo = `SI-${String(invoiceSeq).padStart(5, "0")}`;
      invoiceSeq++;

      const [inv] = await db
        .insert(salesInvoices)
        .values({
          clientId,
          contactId,
          invoiceNo,
          invoiceDate: date,
          invoiceType: "invoice",
          vatableSalesCentavos: isVat ? netSale : 0n,
          exemptSalesCentavos: isVat ? 0n : netSale,
          zeroRatedSalesCentavos: 0n,
          outputVatCentavos: vat,
          totalCentavos: total,
          status: "billed",
        })
        .returning();

      const lines = buildSalesInvoiceLines({
        contactId,
        arAccountId: a["1030"],
        vatableSalesAccountId: a["4010"],
        zeroRatedSalesAccountId: a["4020"],
        exemptSalesAccountId: a["4030"],
        outputVatAccountId: a["2020"],
        totalCentavos: total,
        vatableSalesCentavos: isVat ? netSale : 0n,
        zeroRatedSalesCentavos: 0n,
        exemptSalesCentavos: isVat ? 0n : netSale,
        outputVatCentavos: vat,
        memo: `Sales Invoice ${invoiceNo}`,
      });

      const entryId = await postEntry({
        clientId,
        book: "SJ",
        entryDate: date,
        description: `Sales Invoice ${invoiceNo}`,
        referenceNo: invoiceNo,
        lines,
        postedBy,
      });

      await db.update(salesInvoices).set({ journalEntryId: entryId }).where(eq(salesInvoices.id, inv.id));
      monthInvoiceEntryIds.push({ entryId, contactId, total, invoiceId: inv.id });
    }

    // ~4-5 purchases/month
    const purchasesThisMonth = randInt(4, 5);
    for (let i = 0; i < purchasesThisMonth; i++) {
      const day = randInt(1, daysInMonth);
      const date = isoDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day)));
      const netPurchase = pesosToCentavos(String(randInt(2000, 30000)) + ".00");
      const vat = isVat ? (netPurchase * 12n) / 100n : 0n;
      const total = netPurchase + vat;
      const contactId = pick(c.suppliers);
      const applyEwt = rng() > 0.5;
      const ewt = applyEwt ? (netPurchase * 2n) / 100n : 0n;
      const supplierInvNo = `PINV-${String(supplierInvSeq).padStart(5, "0")}`;
      supplierInvSeq++;

      const [pur] = await db
        .insert(purchases)
        .values({
          clientId,
          contactId,
          supplierInvoiceNo: supplierInvNo,
          invoiceDate: date,
          purchaseClassification: "services",
          vatablePurchaseCentavos: isVat ? netPurchase : 0n,
          exemptPurchaseCentavos: isVat ? 0n : netPurchase,
          zeroRatedPurchaseCentavos: 0n,
          inputVatCentavos: vat,
          ewtApplicable: applyEwt ? "yes" : "no",
          ewtCode: applyEwt ? "WC157" : null,
          ewtAmountCentavos: ewt,
          totalCentavos: total,
        })
        .returning();

      const lines = buildPurchaseLines({
        contactId,
        expenseAccountId: a["5110"], // Professional Fees — a reasonable default for seed demo data
        inputVatAccountId: a["1050"],
        apAccountId: a["2010"],
        ewtPayableAccountId: a["2050"],
        totalCentavos: total,
        vatablePurchaseCentavos: isVat ? netPurchase : 0n,
        exemptPurchaseCentavos: isVat ? 0n : netPurchase,
        zeroRatedPurchaseCentavos: 0n,
        inputVatCentavos: vat,
        ewtAmountCentavos: ewt,
        memo: `Purchase ${supplierInvNo}`,
      });

      const entryId = await postEntry({
        clientId,
        book: "PJ",
        entryDate: date,
        description: `Purchase ${supplierInvNo}`,
        referenceNo: supplierInvNo,
        lines,
        postedBy,
      });

      await db.update(purchases).set({ journalEntryId: entryId }).where(eq(purchases.id, pur.id));
    }

    // Collect ~half of this month's invoices via a Cash Receipt each.
    for (const inv of monthInvoiceEntryIds) {
      if (rng() > 0.55) continue;
      const day = randInt(1, daysInMonth);
      const date = isoDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day)));
      const refNo = `OR-${String(receiptSeq).padStart(5, "0")}`;
      receiptSeq++;

      const [receipt] = await db
        .insert(cashReceipts)
        .values({
          clientId,
          receiptDate: date,
          contactId: inv.contactId,
          particulars: `Collection of ${refNo} against invoice`,
          bankCashAccountId: a["1020"],
          referenceNo: refNo,
          totalCentavos: inv.total,
        })
        .returning();
      await db.insert(cashReceiptLines).values({
        cashReceiptId: receipt.id,
        lineNo: 1,
        allocationAccountId: a["1030"],
        amountCentavos: inv.total,
      });

      const lines = buildCashReceiptLines({
        contactId: inv.contactId,
        bankCashAccountId: a["1020"],
        totalCentavos: inv.total,
        allocations: [{ accountId: a["1030"], amountCentavos: inv.total, memo: "AR collection" }],
        memo: `Collection ${refNo}`,
      });
      const entryId = await postEntry({
        clientId,
        book: "CRB",
        entryDate: date,
        description: `Collection ${refNo}`,
        referenceNo: refNo,
        lines,
        postedBy,
      });
      await db.update(cashReceipts).set({ journalEntryId: entryId }).where(eq(cashReceipts.id, receipt.id));
      await db
        .update(salesInvoices)
        .set({ status: "collected", collectionDate: date })
        .where(eq(salesInvoices.id, inv.invoiceId));
    }

    // 1-2 direct operating-expense disbursements/month (rent, utilities, etc — not tied to a Purchase record)
    const opexAccounts = [a["5050"], a["5060"], a["5070"], a["5100"], a["5150"]];
    const disbCount = randInt(1, 2);
    for (let i = 0; i < disbCount; i++) {
      const day = randInt(1, daysInMonth);
      const date = isoDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day)));
      const amount = pesosToCentavos(String(randInt(1000, 15000)) + ".00");
      const refNo = `CV-${String(disbSeq).padStart(5, "0")}`;
      disbSeq++;
      const expenseAccountId = pick(opexAccounts);

      const [disb] = await db
        .insert(cashDisbursements)
        .values({
          clientId,
          disbursementDate: date,
          particulars: `Operating expense payment ${refNo}`,
          bankCashAccountId: a["1020"],
          referenceNo: refNo,
          totalCentavos: amount,
        })
        .returning();
      await db.insert(cashDisbursementLines).values({
        cashDisbursementId: disb.id,
        lineNo: 1,
        allocationAccountId: expenseAccountId,
        amountCentavos: amount,
      });

      const lines = buildCashDisbursementLines({
        bankCashAccountId: a["1020"],
        totalCentavos: amount,
        allocations: [{ accountId: expenseAccountId, amountCentavos: amount }],
        memo: `Disbursement ${refNo}`,
      });
      const entryId = await postEntry({
        clientId,
        book: "CDB",
        entryDate: date,
        description: `Disbursement ${refNo}`,
        referenceNo: refNo,
        lines,
        postedBy,
      });
      await db.update(cashDisbursements).set({ journalEntryId: entryId }).where(eq(cashDisbursements.id, disb.id));
    }
  }

  // Opening capital injection at the very start of the seeded window, so the
  // Balance Sheet has equity to balance against (spec M1: opening balances
  // post as a single dated "Opening Balance" journal entry that must balance).
  const openingDate = isoDate(months[0]);
  const openingCash = pesosToCentavos("500000.00");
  await postEntry({
    clientId,
    book: "GJ",
    entryDate: openingDate,
    description: "Opening Balance — owner's capital contribution",
    referenceNo: "OB-0001",
    lines: [
      { accountId: a["1020"], debitCentavos: openingCash, creditCentavos: 0n, memo: "Opening balance" },
      { accountId: a["3010"], debitCentavos: 0n, creditCentavos: openingCash, memo: "Opening balance" },
    ],
    postedBy,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
