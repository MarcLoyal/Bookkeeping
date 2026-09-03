import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireRole } from "@/lib/auth/api-auth";
import { createClient } from "@/lib/data/clients";

const schema = z.object({
  registeredName: z.string().min(1, "Registered name is required"),
  tradeName: z.string().optional(),
  tin: z.string().regex(/^\d{3}-\d{3}-\d{3}-\d{5}$/, "TIN format must be 000-000-000-00000"),
  rdoCode: z.string().min(1, "RDO code is required"),
  taxpayerType: z.enum(["individual", "corporation", "partnership", "sole_prop", "professional"]),
  vatStatus: z.enum(["vat", "non_vat", "vat_exempt"]),
  incomeTaxRegime: z.enum(["graduated_itemized", "graduated_osd", "eight_percent", "rcit", "mcit_applicable"]),
  address: z.string().min(1, "Address is required"),
});

export async function POST(req: NextRequest) {
  const auth = await apiRequireRole(["firm_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  if (!user.firmId) {
    return NextResponse.json({ error: "No firm associated with this account." }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid input.", field: issue?.path[0] },
      { status: 400 }
    );
  }

  const client = await createClient(user.id, { firmId: user.firmId, ...parsed.data });
  return NextResponse.json({ id: client.id });
}
