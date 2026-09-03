import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createContact } from "@/lib/data/contacts";

const schema = z.object({
  registeredName: z.string().min(1, "Name is required"),
  type: z.enum(["customer", "supplier", "both", "employee"]),
  tin: z
    .string()
    .regex(/^\d{3}-\d{3}-\d{3}-\d{5}$/, "TIN format must be 000-000-000-00000")
    .optional()
    .or(z.literal("")),
  address: z.string().optional(),
  vatStatus: z.enum(["vat", "non_vat", "vat_exempt"]).optional().or(z.literal("")),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiRequireRole(["firm_admin", "bookkeeper", "reviewer"]);
  if ("response" in auth) return auth.response;
  const { id: clientId } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid input.", field: issue?.path[0] },
      { status: 400 }
    );
  }

  const contact = await createContact(auth.user.id, {
    clientId,
    type: parsed.data.type,
    registeredName: parsed.data.registeredName,
    tin: parsed.data.tin || undefined,
    address: parsed.data.address || undefined,
    vatStatus: parsed.data.vatStatus === "" ? undefined : parsed.data.vatStatus,
  });
  return NextResponse.json({ id: contact.id });
}
