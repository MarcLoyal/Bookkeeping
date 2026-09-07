/** "2025-05-01" -> "2nd Quarter", from the month of a period's start date. */
export function quarterLabelFor(from: string): string {
  const month = Number(from.slice(5, 7));
  const quarter = Math.ceil(month / 3);
  const ordinal = ["1st", "2nd", "3rd", "4th"][quarter - 1];
  return `${ordinal} Quarter`;
}

export type QuarterBounds = {
  year: number;
  quarterNumber: 1 | 2 | 3 | 4;
  yearStartIso: string;
  quarterStartIso: string;
  quarterEndIso: string;
  /** Jan 1 through the day before this quarter starts — null for Q1 (no prior quarter within the taxable year), used to query the cumulative-year-to-date figure 1701Q's Schedule I Item 42 / Schedule II Item 50 add to this quarter's own. */
  previousCumulativeEndIso: string | null;
};

function isoDate(utcMillis: number): string {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

/** The calendar quarter containing `fromIso`, plus the date bounds needed for 1701Q's cumulative-year-to-date computation. */
export function quarterBoundsFor(fromIso: string): QuarterBounds {
  const year = Number(fromIso.slice(0, 4));
  const month = Number(fromIso.slice(5, 7));
  const quarterNumber = Math.ceil(month / 3) as 1 | 2 | 3 | 4;
  const quarterStartMonth0 = (quarterNumber - 1) * 3; // 0-indexed calendar month
  return {
    year,
    quarterNumber,
    yearStartIso: `${year}-01-01`,
    quarterStartIso: isoDate(Date.UTC(year, quarterStartMonth0, 1)),
    quarterEndIso: isoDate(Date.UTC(year, quarterStartMonth0 + 3, 0)),
    previousCumulativeEndIso: quarterNumber === 1 ? null : isoDate(Date.UTC(year, quarterStartMonth0, 0)),
  };
}
