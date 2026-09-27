/**
 * A compliance-calendar aid: which BIR forms a client is presumed to file,
 * and when the current/nearest filing obligation for each is due — NOT a
 * record of what's actually been filed (this app has no filing-status
 * tracking anywhere) and NOT a substitute for a preparer's own judgment on
 * edge cases (see the partnership/GPP note below).
 *
 * Deliberately derived from clients' own tax-profile fields (vatStatus,
 * taxpayerType, withholdingAgent), not client_tax_types — that table's
 * schema comment says it "drives the compliance calendar," but nothing in
 * this app has ever read or written it for a real client (only demo seed
 * data), so it's empty in practice. The profile fields below ARE captured
 * at onboarding for every real client.
 */

export type FormCode = "2550Q" | "2551Q" | "1601-EQ" | "1701Q" | "1701A" | "1702Q" | "1702-RT";

export const FORM_LABELS: Record<FormCode, string> = {
  "2550Q": "Quarterly VAT Return",
  "2551Q": "Quarterly Percentage Tax Return",
  "1601-EQ": "Quarterly Remittance of Creditable Withholding Tax",
  "1701Q": "Quarterly Income Tax Return (Individual)",
  "1701A": "Annual Income Tax Return (Individual)",
  "1702Q": "Quarterly Income Tax Return (Corporation)",
  "1702-RT": "Annual Income Tax Return (Corporation)",
};

export type ClientTaxProfile = {
  vatStatus: "vat" | "non_vat" | "vat_exempt";
  taxpayerType: "individual" | "corporation" | "partnership" | "sole_prop" | "professional";
  withholdingAgent: boolean;
};

/**
 * `taxpayerType: "partnership"` is treated as filing corporate-type forms
 * (1702Q/1702-RT) — correct for an ordinary business partnership, but not
 * for a General Professional Partnership (GPP), which isn't taxed at the
 * entity level at all under Philippine tax law. This app has no field
 * distinguishing the two, so a GPP client would incorrectly get 1702Q/
 * 1702-RT deadlines here. Flagged as a known simplification, not silently
 * assumed away — a GPP is a genuine but comparatively rare case among
 * typical bookkeeping-firm clients.
 */
export function applicableForms(client: ClientTaxProfile): FormCode[] {
  const forms: FormCode[] = [];

  if (client.vatStatus === "vat") forms.push("2550Q");
  else if (client.vatStatus === "non_vat") forms.push("2551Q");
  // vat_exempt: neither.

  if (client.withholdingAgent) forms.push("1601-EQ");

  const isCorporateType = client.taxpayerType === "corporation" || client.taxpayerType === "partnership";
  if (isCorporateType) {
    forms.push("1702Q", "1702-RT");
  } else {
    forms.push("1701Q", "1701A");
  }

  return forms;
}

export type Deadline = { formCode: FormCode; periodLabel: string; dueDateIso: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Last day of 1-indexed `month` in `year`, as a UTC Date. */
function lastDayOfMonth(year: number, month1Indexed: number): Date {
  return new Date(Date.UTC(year, month1Indexed, 0));
}

function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/** The calendar quarter (1-4) containing `date`, and its year. */
function calendarQuarterOf(date: Date): { year: number; quarterNumber: 1 | 2 | 3 | 4 } {
  const month = date.getUTCMonth() + 1;
  return { year: date.getUTCFullYear(), quarterNumber: Math.ceil(month / 3) as 1 | 2 | 3 | 4 };
}

/** The most recently CLOSED calendar quarter as of `today` (i.e. excludes the quarter today falls in). */
function mostRecentlyClosedCalendarQuarter(today: Date): { year: number; quarterNumber: 1 | 2 | 3 | 4 } {
  const { year, quarterNumber } = calendarQuarterOf(today);
  return quarterNumber === 1 ? { year: year - 1, quarterNumber: 4 } : { year, quarterNumber: (quarterNumber - 1) as 1 | 2 | 3 };
}

function calendarQuarterEnd(year: number, quarterNumber: 1 | 2 | 3 | 4): Date {
  return lastDayOfMonth(year, quarterNumber * 3);
}

function calendarQuarterLabel(year: number, quarterNumber: 1 | 2 | 3 | 4): string {
  return `Q${quarterNumber} ${year}`;
}

/** 2550Q / 2551Q — always calendar-quarter based (VAT/percentage tax periods don't follow a fiscal year), due 25 days after quarter close. */
function quarterlyOffsetDeadline(formCode: "2550Q" | "2551Q", today: Date): Deadline {
  const { year, quarterNumber } = mostRecentlyClosedCalendarQuarter(today);
  return {
    formCode,
    periodLabel: calendarQuarterLabel(year, quarterNumber),
    dueDateIso: isoDate(addDaysUTC(calendarQuarterEnd(year, quarterNumber), 25)),
  };
}

/** 1601-EQ — calendar-quarter based, due the last day of the month following quarter close. */
function withholdingRemittanceDeadline(today: Date): Deadline {
  const { year, quarterNumber } = mostRecentlyClosedCalendarQuarter(today);
  const nextMonth1Indexed = quarterNumber * 3 + 1; // may be 13 for Q4 -> handled by lastDayOfMonth via Date.UTC's own month rollover
  return {
    formCode: "1601-EQ",
    periodLabel: calendarQuarterLabel(year, quarterNumber),
    dueDateIso: isoDate(lastDayOfMonth(year, nextMonth1Indexed)),
  };
}

/**
 * 1701Q — individuals, always calendar year (no fiscal-year election under
 * Philippine tax law), fixed due dates May 15 / Aug 15 / Nov 15 for Q1-Q3.
 * No Q4 return — Q4 income rolls into the annual 1701A instead, so during
 * the gap (Q4 close through the following May 15) this correctly keeps
 * showing Q3's obligation rather than inventing one that doesn't exist.
 */
function individualQuarterlyDeadline(today: Date): Deadline | null {
  const fixedDates: { quarterNumber: 1 | 2 | 3; month: number; day: number }[] = [
    { quarterNumber: 1, month: 5, day: 15 },
    { quarterNumber: 2, month: 8, day: 15 },
    { quarterNumber: 3, month: 11, day: 15 },
  ];
  const { year, quarterNumber } = mostRecentlyClosedCalendarQuarter(today);
  if (quarterNumber === 4) {
    // No Q4 1701Q — the "current" one is still Q3 of the same year.
    const q3 = fixedDates[2];
    return { formCode: "1701Q", periodLabel: calendarQuarterLabel(year, 3), dueDateIso: isoDate(new Date(Date.UTC(year, q3.month - 1, q3.day))) };
  }
  const match = fixedDates[quarterNumber - 1];
  return {
    formCode: "1701Q",
    periodLabel: calendarQuarterLabel(year, quarterNumber),
    dueDateIso: isoDate(new Date(Date.UTC(year, match.month - 1, match.day))),
  };
}

/** 1701A — individuals, due April 15 of the year following the taxable year. Always the most recently completed calendar year until the next April 15 passes. */
function individualAnnualDeadline(today: Date): Deadline {
  const currentYear = today.getUTCFullYear();
  const thisAprilFifteenth = new Date(Date.UTC(currentYear, 3, 15));
  const taxableYear = today >= thisAprilFifteenth ? currentYear : currentYear - 1;
  return {
    formCode: "1701A",
    periodLabel: `FY ${taxableYear}`,
    dueDateIso: isoDate(new Date(Date.UTC(taxableYear + 1, 3, 15))),
  };
}

/** Every fiscal-quarter-end month (1-indexed) up to and including `today`, oldest first, for a fiscal year ending in `fiscalYearEndMonth`. */
function fiscalQuarterEndsUpTo(fiscalYearEndMonth: number, today: Date, count: number): Date[] {
  const dates: Date[] = [];
  let year = today.getUTCFullYear() - 2;
  let month = fiscalYearEndMonth;
  let cursor = lastDayOfMonth(year, month);
  while (cursor <= today) {
    dates.push(cursor);
    month += 3;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
    cursor = lastDayOfMonth(year, month);
  }
  return dates.slice(-count);
}

/** 1702Q — corporations, fiscal-year-aware: due 60 days after each of the first 3 quarters of the taxable year close (the 4th/annual close has no quarterly return — 1702-RT covers it instead). */
function corporateQuarterlyDeadline(fiscalYearEndMonth: number, today: Date): Deadline | null {
  const recentEnds = fiscalQuarterEndsUpTo(fiscalYearEndMonth, today, 4);
  // Walk backward from the most recent close, skipping the annual one, to find the most recent *quarterly* (non-annual) close.
  for (let i = recentEnds.length - 1; i >= 0; i--) {
    const end = recentEnds[i];
    const isAnnual = end.getUTCMonth() + 1 === fiscalYearEndMonth;
    if (!isAnnual) {
      return {
        formCode: "1702Q",
        periodLabel: `Quarter ending ${isoDate(end)}`,
        dueDateIso: isoDate(addDaysUTC(end, 60)),
      };
    }
  }
  return null;
}

/** 1702-RT — corporations, fiscal-year-aware: due the 15th day of the 4th month after fiscal year close. */
function corporateAnnualDeadline(fiscalYearEndMonth: number, today: Date): Deadline {
  const recentEnds = fiscalQuarterEndsUpTo(fiscalYearEndMonth, today, 4);
  const lastAnnualClose = [...recentEnds].reverse().find((d) => d.getUTCMonth() + 1 === fiscalYearEndMonth);
  // Always exists: fiscalQuarterEndsUpTo walks a fixed 3-month cadence anchored on fiscalYearEndMonth itself.
  const close = lastAnnualClose!;
  let dueMonth1Indexed = fiscalYearEndMonth + 4;
  let dueYear = close.getUTCFullYear();
  if (dueMonth1Indexed > 12) {
    dueMonth1Indexed -= 12;
    dueYear += 1;
  }
  return {
    formCode: "1702-RT",
    periodLabel: `FY ending ${isoDate(close)}`,
    dueDateIso: isoDate(new Date(Date.UTC(dueYear, dueMonth1Indexed - 1, 15))),
  };
}

/** The current/nearest filing obligation for one form, as of `today`. Null only for 1702Q when no non-annual quarter has closed yet (a brand-new fiscal cycle) — not expected in practice. */
export function currentDeadlineFor(formCode: FormCode, today: Date, fiscalYearEndMonth: number): Deadline | null {
  switch (formCode) {
    case "2550Q":
    case "2551Q":
      return quarterlyOffsetDeadline(formCode, today);
    case "1601-EQ":
      return withholdingRemittanceDeadline(today);
    case "1701Q":
      return individualQuarterlyDeadline(today);
    case "1701A":
      return individualAnnualDeadline(today);
    case "1702Q":
      return corporateQuarterlyDeadline(fiscalYearEndMonth, today);
    case "1702-RT":
      return corporateAnnualDeadline(fiscalYearEndMonth, today);
  }
}
