import { describe, expect, it } from "vitest";
import { quarterBoundsFor, quarterLabelFor } from "../quarter-label";

describe("quarterLabelFor", () => {
  it("maps each month to its calendar quarter", () => {
    expect(quarterLabelFor("2025-01-01")).toBe("1st Quarter");
    expect(quarterLabelFor("2025-03-31")).toBe("1st Quarter");
    expect(quarterLabelFor("2025-04-01")).toBe("2nd Quarter");
    expect(quarterLabelFor("2025-06-30")).toBe("2nd Quarter");
    expect(quarterLabelFor("2025-07-15")).toBe("3rd Quarter");
    expect(quarterLabelFor("2025-10-01")).toBe("4th Quarter");
    expect(quarterLabelFor("2025-12-31")).toBe("4th Quarter");
  });
});

describe("quarterBoundsFor", () => {
  it("has no previous-cumulative range for Q1", () => {
    const b = quarterBoundsFor("2025-02-10");
    expect(b).toEqual({
      year: 2025,
      quarterNumber: 1,
      yearStartIso: "2025-01-01",
      quarterStartIso: "2025-01-01",
      quarterEndIso: "2025-03-31",
      previousCumulativeEndIso: null,
    });
  });

  it("bounds Q2 with a previous-cumulative range ending at Q1's last day", () => {
    const b = quarterBoundsFor("2025-05-15");
    expect(b).toEqual({
      year: 2025,
      quarterNumber: 2,
      yearStartIso: "2025-01-01",
      quarterStartIso: "2025-04-01",
      quarterEndIso: "2025-06-30",
      previousCumulativeEndIso: "2025-03-31",
    });
  });

  it("bounds Q3 correctly", () => {
    const b = quarterBoundsFor("2025-08-01");
    expect(b).toEqual({
      year: 2025,
      quarterNumber: 3,
      yearStartIso: "2025-01-01",
      quarterStartIso: "2025-07-01",
      quarterEndIso: "2025-09-30",
      previousCumulativeEndIso: "2025-06-30",
    });
  });

  it("bounds Q4 correctly (used only by the annual return, not 1701Q)", () => {
    const b = quarterBoundsFor("2025-11-20");
    expect(b).toEqual({
      year: 2025,
      quarterNumber: 4,
      yearStartIso: "2025-01-01",
      quarterStartIso: "2025-10-01",
      quarterEndIso: "2025-12-31",
      previousCumulativeEndIso: "2025-09-30",
    });
  });
});
