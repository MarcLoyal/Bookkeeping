import { describe, expect, it } from "vitest";
import { quarterLabelFor } from "../quarter-label";

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
