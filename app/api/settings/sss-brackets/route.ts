import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createSssBracket } from "@/lib/data/payroll";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  minSalary: z.string().min(1, "Min salary is required"),
  maxSalary: z.string().optional(), // blank = open-ended top bracket
  employeeShare: z.string().min(1, "Employee share is required"),
  employerShare: z.string().min(1, "Employer share is required"),
  ecEmployerShare: z.string().optional(),
  effectiveFrom: z.string().min(1, "Effective From is required"),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await apiRequireRole(["firm_admin"]);
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field: issue?.path[0] }, { status: 400 });
  }

  try {
    await createSssBracket(auth.user.id, {
      minSalaryCentavos: pesosToCentavos(parsed.data.minSalary),
      maxSalaryCentavos: parsed.data.maxSalary ? pesosToCentavos(parsed.data.maxSalary) : null,
      employeeShareCentavos: pesosToCentavos(parsed.data.employeeShare),
      employerShareCentavos: pesosToCentavos(parsed.data.employerShare),
      ecEmployerShareCentavos: parsed.data.ecEmployerShare ? pesosToCentavos(parsed.data.ecEmployerShare) : 0n,
      effectiveFrom: parsed.data.effectiveFrom,
      notes: parsed.data.notes,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add SSS bracket." }, { status: 400 });
  }
}
