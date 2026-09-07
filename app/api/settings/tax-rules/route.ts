import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createTaxRule } from "@/lib/data/tax-rules";

const schema = z.object({
  key: z.string().min(1, "Key is required"),
  value: z.string().min(1, "Value is required"),
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
    await createTaxRule(auth.user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add tax rule." }, { status: 400 });
  }
}
