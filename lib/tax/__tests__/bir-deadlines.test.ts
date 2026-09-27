import { describe, expect, it } from "vitest";
import { applicableForms, currentDeadlineFor } from "../bir-deadlines";

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

describe("applicableForms", () => {
  it("VAT-registered withholding agent, individual", () => {
    expect(applicableForms({ vatStatus: "vat", taxpayerType: "individual", withholdingAgent: true })).toEqual([
      "2550Q",
      "1601-EQ",
      "1701Q",
      "1701A",
    ]);
  });

  it("non-VAT corporation, no withholding", () => {
    expect(applicableForms({ vatStatus: "non_vat", taxpayerType: "corporation", withholdingAgent: false })).toEqual([
      "2551Q",
      "1702Q",
      "1702-RT",
    ]);
  });

  it("VAT-exempt sole prop files neither VAT nor percentage tax form", () => {
    expect(applicableForms({ vatStatus: "vat_exempt", taxpayerType: "sole_prop", withholdingAgent: false })).toEqual([
      "1701Q",
      "1701A",
    ]);
  });

  it("partnership is treated as corporate-type (documents the GPP simplification)", () => {
    expect(applicableForms({ vatStatus: "vat_exempt", taxpayerType: "partnership", withholdingAgent: false })).toEqual([
      "1702Q",
      "1702-RT",
    ]);
  });
});

describe("2550Q / 2551Q — calendar quarter + 25 days", () => {
  it("mid-Q2 references the just-closed Q1", () => {
    const d = currentDeadlineFor("2550Q", utc("2026-05-15"), 12);
    expect(d).toEqual({ formCode: "2550Q", periodLabel: "Q1 2026", dueDateIso: "2026-04-25" });
  });

  it("in Q1, references prior year's Q4 (year rollover)", () => {
    const d = currentDeadlineFor("2551Q", utc("2026-01-15"), 12);
    expect(d).toEqual({ formCode: "2551Q", periodLabel: "Q4 2025", dueDateIso: "2026-01-25" });
  });
});

describe("1601-EQ — calendar quarter, due last day of following month", () => {
  it("mid-Q2 references Q1, due last day of April", () => {
    const d = currentDeadlineFor("1601-EQ", utc("2026-05-15"), 12);
    expect(d).toEqual({ formCode: "1601-EQ", periodLabel: "Q1 2026", dueDateIso: "2026-04-30" });
  });

  it("in Q1, references prior year's Q4, due last day of January (year rollover)", () => {
    const d = currentDeadlineFor("1601-EQ", utc("2026-01-15"), 12);
    expect(d).toEqual({ formCode: "1601-EQ", periodLabel: "Q4 2025", dueDateIso: "2026-01-31" });
  });
});

describe("1701Q — individuals, fixed calendar dates, no Q4", () => {
  it("in Q2 (after May 15 has passed), references Q1 due May 15", () => {
    const d = currentDeadlineFor("1701Q", utc("2026-06-01"), 12);
    expect(d).toEqual({ formCode: "1701Q", periodLabel: "Q1 2026", dueDateIso: "2026-05-15" });
  });

  it("in Q4 (no 1701Q due), still shows Q3's due date, not a nonexistent Q4 one", () => {
    const d = currentDeadlineFor("1701Q", utc("2026-12-15"), 12);
    expect(d).toEqual({ formCode: "1701Q", periodLabel: "Q3 2026", dueDateIso: "2026-11-15" });
  });

  it("in Q1 (before Q1 has closed), still shows prior year's Q3 -- the gap after Q4", () => {
    const d = currentDeadlineFor("1701Q", utc("2026-02-01"), 12);
    expect(d).toEqual({ formCode: "1701Q", periodLabel: "Q3 2025", dueDateIso: "2025-11-15" });
  });

  it("on the due date itself still resolves to that same period (not yet superseded)", () => {
    const d = currentDeadlineFor("1701Q", utc("2026-05-15"), 12);
    expect(d).toEqual({ formCode: "1701Q", periodLabel: "Q1 2026", dueDateIso: "2026-05-15" });
  });
});

describe("1701A — individuals, April 15 following year", () => {
  it("before April 15, references the prior taxable year", () => {
    const d = currentDeadlineFor("1701A", utc("2026-03-01"), 12);
    expect(d).toEqual({ formCode: "1701A", periodLabel: "FY 2025", dueDateIso: "2026-04-15" });
  });

  it("on April 15 itself, rolls to the just-closed taxable year", () => {
    const d = currentDeadlineFor("1701A", utc("2026-04-15"), 12);
    expect(d).toEqual({ formCode: "1701A", periodLabel: "FY 2026", dueDateIso: "2027-04-15" });
  });

  it("after April 15, references the current taxable year", () => {
    const d = currentDeadlineFor("1701A", utc("2026-04-16"), 12);
    expect(d).toEqual({ formCode: "1701A", periodLabel: "FY 2026", dueDateIso: "2027-04-15" });
  });
});

describe("1702Q — corporations, fiscal-year-aware, 60 days after each of the first 3 quarters", () => {
  it("calendar fiscal year (Dec): mid-year references the just-closed non-annual quarter", () => {
    const d = currentDeadlineFor("1702Q", utc("2026-08-15"), 12);
    expect(d).toEqual({ formCode: "1702Q", periodLabel: "Quarter ending 2026-06-30", dueDateIso: "2026-08-29" });
  });

  it("calendar fiscal year: right after the annual close, skips it and references the prior Q3", () => {
    const d = currentDeadlineFor("1702Q", utc("2026-01-15"), 12);
    expect(d).toEqual({ formCode: "1702Q", periodLabel: "Quarter ending 2025-09-30", dueDateIso: "2025-11-29" });
  });

  it("non-calendar fiscal year (June 30 FYE): references its own quarter cadence", () => {
    const d = currentDeadlineFor("1702Q", utc("2026-11-01"), 6);
    expect(d).toEqual({ formCode: "1702Q", periodLabel: "Quarter ending 2026-09-30", dueDateIso: "2026-11-29" });
  });

  it("non-calendar fiscal year: right after its own annual close, skips it for the prior quarter", () => {
    const d = currentDeadlineFor("1702Q", utc("2026-07-15"), 6);
    expect(d).toEqual({ formCode: "1702Q", periodLabel: "Quarter ending 2026-03-31", dueDateIso: "2026-05-30" });
  });
});

describe("1702-RT — corporations, fiscal-year-aware, 15th day of the 4th month after close", () => {
  it("calendar fiscal year (Dec close): due April 15 of the following year", () => {
    const d = currentDeadlineFor("1702-RT", utc("2026-02-01"), 12);
    expect(d).toEqual({ formCode: "1702-RT", periodLabel: "FY ending 2025-12-31", dueDateIso: "2026-04-15" });
  });

  it("non-calendar fiscal year (June 30 close): due October 15 of the same year, no year rollover needed", () => {
    const d = currentDeadlineFor("1702-RT", utc("2026-09-01"), 6);
    expect(d).toEqual({ formCode: "1702-RT", periodLabel: "FY ending 2026-06-30", dueDateIso: "2026-10-15" });
  });
});
