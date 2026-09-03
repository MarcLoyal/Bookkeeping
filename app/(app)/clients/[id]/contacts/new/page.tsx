import { requireStaffUser } from "@/lib/auth/current-user";
import { NewContactForm } from "./new-contact-form";

export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffUser();
  const { id } = await params;

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold">New Contact</h2>
      <p className="mt-1 text-sm text-slate-500">Add a customer, supplier, or employee for this client.</p>
      <div className="mt-4">
        <NewContactForm clientId={id} />
      </div>
    </div>
  );
}
