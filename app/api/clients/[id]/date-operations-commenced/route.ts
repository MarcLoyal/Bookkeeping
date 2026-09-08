import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { updateDateOperationsCommenced } from "@/lib/data/clients";

const schema = z.object({
  dateOperationsCommenced: z.string().min(1, "Date is required"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field: issue?.path[0] }, { status: 400 });
  }

  try {
    await updateDateOperationsCommenced(auth.user.id, clientId, parsed.data.dateOperationsCommenced);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update." }, { status: 400 });
  }
}
