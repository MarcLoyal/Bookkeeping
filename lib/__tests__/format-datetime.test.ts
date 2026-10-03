import { describe, expect, it } from "vitest";
import { formatDateTimePH } from "../format-datetime";

describe("formatDateTimePH", () => {
  it("converts UTC into Asia/Manila (UTC+8), rolling the date forward past midnight", () => {
    // The exact scenario reported: shown as "2026-10-03 17:14" (raw UTC)
    // when it was already past midnight on Oct 4 in the Philippines.
    expect(formatDateTimePH("2026-10-03T17:14:00Z")).toBe("2026-10-04 01:14");
  });

  it("accepts a Date object as well as an ISO string", () => {
    expect(formatDateTimePH(new Date("2026-10-03T17:14:00Z"))).toBe("2026-10-04 01:14");
  });

  it("does not roll the date forward when the UTC hour is still early enough in the same PH day", () => {
    // 01:00 UTC -> 09:00 PH, same calendar day both sides.
    expect(formatDateTimePH("2026-06-15T01:00:00Z")).toBe("2026-06-15 09:00");
  });

  it("zero-pads single-digit month/day/hour/minute", () => {
    expect(formatDateTimePH("2026-01-02T00:05:00Z")).toBe("2026-01-02 08:05");
  });

  it("rolls the year forward across a Dec 31 -> Jan 1 UTC/PH boundary", () => {
    expect(formatDateTimePH("2025-12-31T17:00:00Z")).toBe("2026-01-01 01:00");
  });

  it("renders midnight PH time as 00:00, not 24:00", () => {
    expect(formatDateTimePH("2026-03-14T16:00:00Z")).toBe("2026-03-15 00:00");
  });

  it("includes seconds, zero-padded, when seconds: true is passed", () => {
    expect(formatDateTimePH("2026-10-03T17:14:05Z", { seconds: true })).toBe("2026-10-04 01:14:05");
  });

  it("omits seconds by default", () => {
    expect(formatDateTimePH("2026-10-03T17:14:05Z")).toBe("2026-10-04 01:14");
  });
});
