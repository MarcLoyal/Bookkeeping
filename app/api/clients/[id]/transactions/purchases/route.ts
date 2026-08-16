import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { postPurchase } from "@/lib/data/post-transaction";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  contactId: z.string().uuid(),
  supplierInvoiceNo: z.string().min(1),
  invoiceDate: z.string().min(1),
  purchaseClassification: z.enum([
    "capital_goods",
    "goods_other_than_capital",
    "services",
    "domestic_purchase_not_qualified",
    "importation",
  ]),
  expenseAccountCode: z.string().min(1),
  vatablePurchase: z.string().optional(),
  zeroRatedPurchase: z.string().optional(),
  exemptPurchase: z.string().optional(),
  inputVat: z.string().optional(),
  ewtAmount: z.string().optional(),
  ewtCode: z.string().optional(),
});

function amt(v?: string): bigint {
  const s = (v ?? "").trim();
  return s === "" ? 0n : pesosToCentavos(s);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "reviewer"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const vatablePurchaseCentavos = amt(parsed.data.vatablePurchase);
    const zeroRatedPurchaseCentavos = amt(parsed.data.zeroRatedPurchase);
    const exemptPurchaseCentavos = amt(parsed.data.exemptPurchase);
    const inputVatCentavos = amt(parsed.data.inputVat);
    const ewtAmountCentavos = amt(parsed.data.ewtAmount);
    const totalCentavos = vatablePurchaseCentavos + zeroRatedPurchaseCentavos + exemptPurchaseCentavos + inputVatCentavos;

    const entryId = await postPurchase(auth.user.id, {
      clientId,
      contactId: parsed.data.contactId,
      supplierInvoiceNo: parsed.data.supplierInvoiceNo,
      invoiceDate: parsed.data.invoiceDate,
      purchaseClassification: parsed.data.purchaseClassification,
      expenseAccountCode: parsed.data.expenseAccountCode,
      vatablePurchaseCentavos,
      zeroRatedPurchaseCentavos,
      exemptPurchaseCentavos,
      inputVatCentavos,
      ewtAmountCentavos,
      ewtCode: parsed.data.ewtCode || undefined,
      totalCentavos,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post purchase." },
      { status: 400 }
    );
  }
}
