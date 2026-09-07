import { applyRate, type Centavos } from "../money";

/**
 * Minimum Corporate Income Tax — Sec. 27(E) of the NIRC, as amended by RA
 * 11534 (CREATE Act). 2% of gross income, imposed on any domestic or
 * resident foreign corporation beginning the 4th taxable year immediately
 * following the year it commenced business operations, whenever MCIT
 * exceeds the regular/normal income tax due (or whenever taxable income is
 * zero/negative). CREATE temporarily reduced the rate to 1% from July 1,
 * 2020 to June 30, 2023; that window has since closed, so this app doesn't
 * model it — `mcit_rate` in Tax Rules should read 2% for any current date.
 */
export function computeMcit(grossIncomeCentavos: Centavos, rateNumerator: bigint, rateDenominator: bigint): Centavos {
  if (grossIncomeCentavos <= 0n) return 0n;
  return applyRate(grossIncomeCentavos, rateNumerator, rateDenominator);
}

/**
 * Whether MCIT applies as of `asOfDate`, per the 4th-taxable-year rule
 * above. Treats each calendar year as one taxable year (this app doesn't
 * yet special-case a fiscal-year client's actual non-calendar taxable-year
 * boundaries for this specific gate). Returns false — no MCIT comparison,
 * RCIT alone applies — when `dateOperationsCommenced` isn't set, rather
 * than guessing; the caller/form surfaces that as "not determinable" with
 * a note, not a silent assumption either way.
 */
export function isMcitApplicable(dateOperationsCommenced: string | null, asOfDate: string): boolean {
  if (!dateOperationsCommenced) return false;
  const commencedYear = Number(dateOperationsCommenced.slice(0, 4));
  const asOfYear = Number(asOfDate.slice(0, 4));
  return asOfYear - commencedYear >= 3;
}

/** "Whichever is higher" — the form's own instruction (1702Q Schedule 2 Item 13, 1702-RT Item 43). Plain enough not to need its own citation beyond the two above. */
export function higherOfRcitOrMcit(rcitDueCentavos: Centavos, mcitDueCentavos: Centavos | null): Centavos {
  if (mcitDueCentavos === null) return rcitDueCentavos;
  return mcitDueCentavos > rcitDueCentavos ? mcitDueCentavos : rcitDueCentavos;
}
