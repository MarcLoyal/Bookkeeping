import "server-only";
import { eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { clients } from "@/db/schema";
import { applicableForms, currentDeadlineFor, FORM_LABELS, type Deadline, type FormCode } from "@/lib/tax/bir-deadlines";

export type UpcomingDeadline = Deadline & {
  formLabel: string;
  clientId: string;
  clientName: string;
};

/**
 * Every applicable form's current filing obligation, for every active
 * client this user can access, sorted soonest-due first. "Applicable" is
 * derived from each client's own tax-profile fields (see
 * lib/tax/bir-deadlines.ts's doc comment for why, not client_tax_types).
 * Only `status = 'active'` clients — onboarding clients may not have a
 * finalized tax profile yet, and inactive ones are no longer being
 * serviced.
 */
export async function listUpcomingDeadlines(userId: string): Promise<UpcomingDeadline[]> {
  return withUserContext(userId, async (tx) => {
    const activeClients = await tx
      .select({
        id: clients.id,
        registeredName: clients.registeredName,
        vatStatus: clients.vatStatus,
        taxpayerType: clients.taxpayerType,
        withholdingAgent: clients.withholdingAgent,
        fiscalYearEndMonth: clients.fiscalYearEndMonth,
      })
      .from(clients)
      .where(eq(clients.status, "active"));

    const today = new Date();
    const deadlines: UpcomingDeadline[] = [];

    for (const client of activeClients) {
      const forms = applicableForms(client);
      for (const formCode of forms) {
        const deadline = currentDeadlineFor(formCode as FormCode, today, client.fiscalYearEndMonth);
        if (!deadline) continue;
        deadlines.push({
          ...deadline,
          formLabel: FORM_LABELS[deadline.formCode],
          clientId: client.id,
          clientName: client.registeredName,
        });
      }
    }

    return deadlines.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
  });
}
