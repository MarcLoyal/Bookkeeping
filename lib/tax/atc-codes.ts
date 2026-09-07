/**
 * Alphanumeric Tax Code (ATC) reference for expanded withholding tax —
 * transcribed verbatim from the Schedule of Alphanumeric Tax Codes printed
 * on page 2 of BIR Form 1601-EQ (January 2019 ENCS), the actual form PDF
 * supplied for this feature. Display-only: `purchases.ewtCode` stays a
 * free-text field entered at posting time (unchanged), this just looks up
 * a human-readable description for known codes on the 1601-EQ/2307
 * replicas. An unrecognized code renders as entered, with no invented
 * description — this list is deliberately not exhaustive (the real
 * schedule has more categories than an SME bookkeeping client is likely to
 * use), and the underlying withholding rate is whatever was posted, not
 * recomputed from this table.
 */
export const ATC_CODES: Record<string, { description: string; rate: string }> = {
  WI010: { description: "Professional fees (lawyers, CPAs, engineers, etc.) — gross income ≤ ₱3M", rate: "5%" },
  WI011: { description: "Professional fees (lawyers, CPAs, engineers, etc.) — gross income > ₱3M or VAT-registered", rate: "10%" },
  WC010: { description: "Professional fees to a corporation — gross income ≤ ₱720,000", rate: "10%" },
  WC011: { description: "Professional fees to a corporation — gross income > ₱720,000", rate: "15%" },
  WI050: { description: "Management and technical consultants — gross income ≤ ₱3M", rate: "5%" },
  WI051: { description: "Management and technical consultants — gross income > ₱3M or VAT-registered", rate: "10%" },
  WC050: { description: "Management and technical consultants (corporation) — gross income ≤ ₱720,000", rate: "10%" },
  WC051: { description: "Management and technical consultants (corporation) — gross income > ₱720,000", rate: "15%" },
  WI100: { description: "Rentals — personal property > ₱10,000/year and real property used in business", rate: "5%" },
  WC100: { description: "Rentals — personal property > ₱10,000/year and real property used in business (corporation)", rate: "5%" },
  WI120: { description: "Income payments to certain contractors", rate: "2%" },
  WC120: { description: "Income payments to certain contractors (corporation)", rate: "2%" },
  WI158: { description: "Top withholding agent → local/resident supplier of goods", rate: "1%" },
  WC158: { description: "Top withholding agent → local/resident supplier of goods (corporation)", rate: "1%" },
  WI160: { description: "Top withholding agent → local/resident supplier of services", rate: "2%" },
  WC160: { description: "Top withholding agent → local/resident supplier of services (corporation)", rate: "2%" },
  WI515: { description: "Commissions/rebates to independent sales/marketing agents — gross income ≤ ₱3M", rate: "5%" },
  WI516: { description: "Commissions/rebates to independent sales/marketing agents — gross income > ₱3M", rate: "10%" },
  WC515: { description: "Commissions/rebates to independent sales/marketing agents (corporation) — gross income ≤ ₱720,000", rate: "10%" },
  WC516: { description: "Commissions/rebates to independent sales/marketing agents (corporation) — gross income > ₱720,000", rate: "15%" },
};

export function describeAtc(code: string | null | undefined): string | null {
  if (!code) return null;
  const entry = ATC_CODES[code.toUpperCase().trim()];
  return entry ? `${entry.description} (${entry.rate})` : null;
}
