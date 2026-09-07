import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createEmployee } from "@/lib/data/payroll";
import { pesosToCentavos } from "@/lib/money";

const schema = z.object({
  registeredName: z.string().min(1, "Name is required"),
  tin: z
    .string()
    .regex(/^\d{3}-\d{3}-\d{3}-\d{5}$/, "TIN format must be 000-000-000-00000")
    .optional()
    .or(z.literal("")),
  address: z.string().optional(),
  employeeNo: z.string().optional(),
  sssNo: z.string().optional(),
  philhealthNo: z.string().optional(),
  pagibigNo: z.string().optional(),
  position: z.string().optional(),
  payFrequency: z.enum(["monthly", "semi_monthly"]),
  basicPay: z.string().min(1, "Basic pay is required"),
  isMinimumWageEarner: z.enum(["yes", "no"]),
  dateHired: z.string().min(1, "Date hired is required"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "reviewer"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field: issue?.path[0] }, { status: 400 });
  }

  let basicPayCentavos: bigint;
  try {
    basicPayCentavos = pesosToCentavos(parsed.data.basicPay);
  } catch {
    return NextResponse.json({ error: "Basic pay must be a valid amount.", field: "basicPay" }, { status: 400 });
  }

  try {
    const employee = await createEmployee(auth.user.id, {
      clientId,
      registeredName: parsed.data.registeredName,
      tin: parsed.data.tin || undefined,
      address: parsed.data.address || undefined,
      employeeNo: parsed.data.employeeNo || undefined,
      sssNo: parsed.data.sssNo || undefined,
      philhealthNo: parsed.data.philhealthNo || undefined,
      pagibigNo: parsed.data.pagibigNo || undefined,
      position: parsed.data.position || undefined,
      payFrequency: parsed.data.payFrequency,
      basicPayCentavos,
      isMinimumWageEarner: parsed.data.isMinimumWageEarner === "yes",
      dateHired: parsed.data.dateHired,
    });
    return NextResponse.json({ id: employee.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create employee." }, { status: 400 });
  }
}
