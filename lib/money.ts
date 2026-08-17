/**
 * Money is always centavos (1/100 peso) stored as bigint. Never use `number`
 * for arithmetic on money — floats introduce rounding drift that is
 * unacceptable in a books-of-accounts system. `number` only appears at the
 * UI boundary as a display value after formatting.
 */

export type Centavos = bigint;

const CENTAVOS_PER_PESO = 100n;

/**
 * Parses a decimal peso string (e.g. "1234567.89", "1,234,567.89", "-12.5")
 * into centavos without ever going through floating point.
 */
export function pesosToCentavos(input: string): Centavos {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") {
    throw new Error("pesosToCentavos: empty input");
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`pesosToCentavos: invalid decimal string "${input}"`);
  }
  const [, sign, wholePart, fractionPartRaw = ""] = match;
  // Pad/truncate the fraction to exactly 2 digits, rounding half-up on truncation.
  let fraction = fractionPartRaw.slice(0, 2).padEnd(2, "0");
  if (fractionPartRaw.length > 2) {
    const roundingDigit = fractionPartRaw.charCodeAt(2) - 48;
    let fractionValue = BigInt(fraction);
    if (roundingDigit >= 5) fractionValue += 1n;
    if (fractionValue >= 100n) {
      // carry into the whole part
      const whole = BigInt(wholePart) + 1n;
      return applySign(sign, whole * CENTAVOS_PER_PESO + (fractionValue - 100n));
    }
    fraction = fractionValue.toString().padStart(2, "0");
  }
  const centavos = BigInt(wholePart) * CENTAVOS_PER_PESO + BigInt(fraction);
  return applySign(sign, centavos);
}

function applySign(sign: string, value: Centavos): Centavos {
  return sign === "-" ? -value : value;
}

/** Integer number of whole centavos, e.g. `1050` for ₱10.50. Use for known-safe integer inputs (tests, seeds). */
export function centavos(value: number | bigint): Centavos {
  if (typeof value === "bigint") return value;
  if (!Number.isInteger(value)) {
    throw new Error(`centavos(): expected an integer number of centavos, got ${value}`);
  }
  return BigInt(value);
}

/** Formats centavos as a peso string with thousands separators and 2 decimals, e.g. "1,234,567.89". */
export function formatCentavos(value: Centavos, opts: { sign?: boolean } = {}): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / CENTAVOS_PER_PESO;
  const frac = (abs % CENTAVOS_PER_PESO).toString().padStart(2, "0");
  const wholeGrouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const prefix = negative ? "-" : opts.sign ? "+" : "";
  return `${prefix}${wholeGrouped}.${frac}`;
}

export function addCentavos(...values: Centavos[]): Centavos {
  return values.reduce((sum, v) => sum + v, 0n);
}

export function subtractCentavos(a: Centavos, b: Centavos): Centavos {
  return a - b;
}

export function sumCentavos(values: Centavos[]): Centavos {
  return values.reduce((sum, v) => sum + v, 0n);
}

export function negateCentavos(value: Centavos): Centavos {
  return -value;
}

export function isZero(value: Centavos): boolean {
  return value === 0n;
}

/**
 * Rounds a fraction (numerator/denominator) to the nearest integer, half-up,
 * away from zero. This is THE rounding rule for this codebase — apply it
 * once, at the point of computation, never repeatedly.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("roundHalfUp: division by zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const twice = n * 2n + d;
  const result = twice / (d * 2n);
  return negative ? -result : result;
}

/**
 * Applies a rate expressed as an exact fraction (numerator/denominator, as
 * stored in tax_rules — e.g. a standard-VAT-style rate is numerator 12,
 * denominator 100) to a centavos amount, rounding half-up once. Never
 * hardcode a decimal rate literal directly against centavos — go through
 * tax_rules and this function.
 */
export function applyRate(amount: Centavos, rateNumerator: bigint, rateDenominator: bigint): Centavos {
  return roundHalfUp(amount * rateNumerator, rateDenominator);
}

/**
 * Splits `total` into `parts.length` centavos amounts proportional to
 * `parts` (arbitrary positive weights), guaranteeing the pieces sum back to
 * `total` exactly (largest-remainder method — no centavo lost or invented).
 */
export function allocateCentavos(total: Centavos, parts: bigint[]): Centavos[] {
  const partsSum = parts.reduce((s, p) => s + p, 0n);
  if (partsSum === 0n) {
    if (total !== 0n) throw new Error("allocateCentavos: zero weights but nonzero total");
    return parts.map(() => 0n);
  }
  const floors = parts.map((p) => (total * p) / partsSum);
  let remainder = total - floors.reduce((s, f) => s + f, 0n);
  const remainders = parts.map((p, i) => ({ i, r: (total * p) % partsSum }));
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : 0));
  const result = [...floors];
  const step = total >= 0n ? 1n : -1n;
  for (let k = 0; k < remainders.length && remainder !== 0n; k++) {
    result[remainders[k].i] += step;
    remainder -= step;
  }
  return result;
}
