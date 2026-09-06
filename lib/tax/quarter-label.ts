/** "2025-05-01" -> "2nd Quarter", from the month of a period's start date. */
export function quarterLabelFor(from: string): string {
  const month = Number(from.slice(5, 7));
  const quarter = Math.ceil(month / 3);
  const ordinal = ["1st", "2nd", "3rd", "4th"][quarter - 1];
  return `${ordinal} Quarter`;
}
