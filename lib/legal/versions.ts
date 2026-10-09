/**
 * Single source of truth for which version of the Terms of Service and
 * Privacy Policy is currently in effect — read by the pages themselves
 * (app/(marketing)/terms, app/(marketing)/privacy), the signup/onboarding
 * checkbox handlers, and requireCurrentUser()'s re-acceptance gate
 * (lib/auth/current-user.ts). Bumping either string here is what makes
 * every existing user re-prompted on their next login: the gate compares
 * a user's most recent legal_acceptances row against these exact values,
 * not just "has any row at all."
 *
 * Both documents are DRAFTS — see each page's own banner. Real version
 * numbers (e.g. "1.0") should replace these "-draft" values only once
 * legal review is complete and the content is actually final.
 */
export const CURRENT_TERMS_VERSION = "0.1-draft";
export const CURRENT_PRIVACY_VERSION = "0.1-draft";

/** Shown on both pages next to the version number. Update when the draft content changes, even before it's final. */
export const LEGAL_LAST_UPDATED = "2026-10-09";
