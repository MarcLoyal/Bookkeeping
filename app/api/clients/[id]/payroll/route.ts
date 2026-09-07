import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createPayrollRun } from "@/lib/data/payroll";
import { pesosToCentavos } from "@/lib/money";

const entrySchema = z.object({
  employeeId: z.string().uuid(),
  overtimePay: z.string().optional(),
  otherTaxableEarnings: z.string().optional(),
  deMinimis: z.string().optional(),
  thirteenthMonthPay: z.string().optional(),
});

const schema = z.object({
  runType: z.enum(["regular", "thirteenth_month"]),
  periodStart: z.string().min(1, "Period Start is required"),
  periodEnd: z.string().min(1, "Period End is required"),
  payDate: z.string().min(1, "Pay Date is required"),
  entries: z.array(entrySchema).min(1, "Select at least one employee"),
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
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field: issue?.path[0] }, { status: 400 });
  }

  try {
    const { runId } = await createPayrollRun(auth.user.id, {
      clientId,
      runType: parsed.data.runType,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      payDate: parsed.data.payDate,
      entries: parsed.data.entries.map((e) => ({
        employeeId: e.employeeId,
        overtimePayCentavos: amt(e.overtimePay),
        otherTaxableEarningsCentavos: amt(e.otherTaxableEarnings),
        deMinimisCentavos: amt(e.deMinimis),
        thirteenthMonthPayCentavos: amt(e.thirteenthMonthPay),
      })),
    });
    return NextResponse.json({ runId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to post payroll run." }, { status: 400 });
  }
}
