const PH_TIME_ZONE = "Asia/Manila";

const baseOptions: Intl.DateTimeFormatOptions = {
  timeZone: PH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // hourCycle: "h23" specifically, not hour12: false — avoids a known
  // Intl quirk where some locale/engine combinations render midnight as
  // "24:00" under hour12: false.
  hourCycle: "h23",
};

const minuteFormatter = new Intl.DateTimeFormat("en-CA", baseOptions);
const secondFormatter = new Intl.DateTimeFormat("en-CA", { ...baseOptions, second: "2-digit" });

function partsToString(parts: Intl.DateTimeFormatPart[], withSeconds: boolean): string {
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const hms = withSeconds ? `${get("hour")}:${get("minute")}:${get("second")}` : `${get("hour")}:${get("minute")}`;
  return `${get("year")}-${get("month")}-${get("day")} ${hms}`;
}

/**
 * Formats a stored (UTC) timestamp for display in Philippine time
 * (Asia/Manila, UTC+8) as "YYYY-MM-DD HH:MM" (or "YYYY-MM-DD HH:MM:SS"
 * with `seconds: true`), 24-hour — the same shapes call sites already
 * used with `.toISOString().replace("T", " ").slice(0, 16 or 19)`, just
 * converted to the right timezone first. Storage stays UTC everywhere;
 * this is a display-only conversion.
 *
 * Uses Intl.DateTimeFormat with timeZone: "Asia/Manila" rather than a
 * manual +8 offset so it stays correct against the runtime's own IANA
 * tzdata rather than a hardcoded assumption.
 */
export function formatDateTimePH(date: Date | string, options?: { seconds?: boolean }): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const withSeconds = options?.seconds ?? false;
  const formatter = withSeconds ? secondFormatter : minuteFormatter;
  return partsToString(formatter.formatToParts(d), withSeconds);
}
