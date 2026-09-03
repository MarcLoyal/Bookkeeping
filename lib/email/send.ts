import "server-only";
import { appendFileSync } from "node:fs";

export type Email = {
  to: string;
  subject: string;
  text: string;
};

/**
 * No email provider is configured yet (see .env.example). This logs the
 * email to the server console instead of sending it, so local/dev password
 * resets are still usable end-to-end. Swap this out for a real provider
 * (Resend, SES, etc.) by replacing the body of this function — every caller
 * already goes through this single choke point.
 *
 * DEV_EMAIL_OUTBOX_PATH is an optional, dev/test-only escape hatch: when
 * set, every sent email is also appended as a JSON line to that file, so
 * e2e tests (see e2e/password-reset.test.ts) can read the reset link
 * without a real inbox. Unset in production — nothing writes there.
 */
export async function sendEmail(email: Email): Promise<void> {
  console.log(
    `[email] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`
  );

  const outboxPath = process.env.DEV_EMAIL_OUTBOX_PATH;
  if (outboxPath) {
    appendFileSync(outboxPath, JSON.stringify({ ...email, sentAt: new Date().toISOString() }) + "\n");
  }
}
