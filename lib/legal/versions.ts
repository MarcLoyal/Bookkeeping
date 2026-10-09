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
 * When the next real revision (e.g. after a round of legal review) is
 * ready to publish, update the page content, then bump the matching
 * version string(s) here and LEGAL_EFFECTIVE_DATE together — that's the
 * entire mechanism for making every existing user re-accept on their
 * next login.
 */
export const CURRENT_TERMS_VERSION = "1.0";
export const CURRENT_PRIVACY_VERSION = "1.0";

/** Shown on both pages next to the version number. Update together with whichever version constant(s) change. */
export const LEGAL_EFFECTIVE_DATE = "October 9, 2026";
