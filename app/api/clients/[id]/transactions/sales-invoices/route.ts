import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { postSalesInvoice } from "@/lib/data/post-transaction";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  contactId: z.string().uuid(),
  invoiceNo: z.string().min(1),
  invoiceDate: z.string().min(1),
  vatableSales: z.string().optional(),
  zeroRatedSales: z.string().optional(),
  exemptSales: z.string().optional(),
  outputVat: z.string().optional(),
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
    const vatableSalesCentavos = amt(parsed.data.vatableSales);
    const zeroRatedSalesCentavos = amt(parsed.data.zeroRatedSales);
    const exemptSalesCentavos = amt(parsed.data.exemptSales);
    const outputVatCentavos = amt(parsed.data.outputVat);
    const totalCentavos = vatableSalesCentavos + zeroRatedSalesCentavos + exemptSalesCentavos + outputVatCentavos;

    const entryId = await postSalesInvoice(auth.user.id, {
      clientId,
      contactId: parsed.data.contactId,
      invoiceNo: parsed.data.invoiceNo,
      invoiceDate: parsed.data.invoiceDate,
      vatableSalesCentavos,
      zeroRatedSalesCentavos,
      exemptSalesCentavos,
      outputVatCentavos,
      totalCentavos,
    });
    return NextResponse.json({ entryId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post sales invoice." },
      { status: 400 }
    );
  }
}
