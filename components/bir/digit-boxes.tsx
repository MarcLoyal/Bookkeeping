import type { Centavos } from "@/lib/money";

const boxClass =
  "flex h-6 w-4 shrink-0 items-center justify-center border-r border-slate-400 font-mono text-[11px] last:border-r-0";

/** One row of bordered single-character cells — the boxed "one digit per box" style BIR forms use for TIN and amount fields. */
function BoxRow({ chars }: { chars: string[] }) {
  return (
    <span className="inline-flex border border-slate-400">
      {chars.map((c, i) => (
        <span key={i} className={boxClass}>
          {c}
        </span>
      ))}
    </span>
  );
}

/** TIN as 3 boxed groups of 3-3-3 plus a 5-digit branch code, dash-separated — same grouping as the app's own TIN format. */
export function TinBoxes({ tin }: { tin: string | null | undefined }) {
  const digits = (tin ?? "").replace(/\D/g, "").padEnd(14, " ").slice(0, 14);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 14)];
  return (
    <span className="inline-flex items-center gap-1">
      {groups.map((g, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <BoxRow chars={g.split("")} />
          {i < groups.length - 1 && <span className="text-slate-400">-</span>}
        </span>
      ))}
    </span>
  );
}

/** A left-to-right run of boxed characters for free text (name, address line, RDO code, etc.). */
export function TextBoxes({ value, length }: { value: string | null | undefined; length: number }) {
  const chars = (value ?? "").toUpperCase().padEnd(length, " ").slice(0, length).split("");
  return <BoxRow chars={chars} />;
}

/**
 * A peso amount as boxed whole-number digits, a boxed decimal point, and two
 * boxed centavo digits — the right-aligned money field every BIR return
 * uses. `null` renders as all-blank boxes (a line this app doesn't compute).
 */
export function AmountBoxes({ value, wholeDigits = 12 }: { value: Centavos | null; wholeDigits?: number }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1">
        <BoxRow chars={Array(wholeDigits).fill(" ")} />
        <span className="text-slate-400">.</span>
        <BoxRow chars={[" ", " "]} />
      </span>
    );
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const pesos = (abs / 100n).toString();
  const cents = (abs % 100n).toString().padStart(2, "0");
  const wholeChars = pesos.padStart(wholeDigits, " ").slice(-wholeDigits).split("");
  if (negative) {
    // Slot the sign into the last blank box before the first digit, if room; otherwise prefix the digit run.
    const firstDigitIdx = wholeChars.findIndex((c) => c !== " ");
    if (firstDigitIdx > 0) wholeChars[firstDigitIdx - 1] = "(";
  }
  return (
    <span className="inline-flex items-center gap-1">
      <BoxRow chars={wholeChars} />
      <span className="text-slate-400">.</span>
      <BoxRow chars={cents.split("")} />
      {negative && <span className="text-slate-500">)</span>}
    </span>
  );
}
