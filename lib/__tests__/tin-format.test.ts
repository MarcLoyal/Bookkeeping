import { describe, expect, it } from "vitest";
import { formatTin } from "../tin-format";

describe("formatTin", () => {
  it("inserts dashes as digits accumulate", () => {
    expect(formatTin("1")).toBe("1");
    expect(formatTin("123")).toBe("123");
    expect(formatTin("1234")).toBe("123-4");
    expect(formatTin("123345679")).toBe("123-345-679");
    expect(formatTin("12334567900000")).toBe("123-345-679-00000");
  });

  it("strips non-digit characters typed or pasted in", () => {
    expect(formatTin("123-345-679-00000")).toBe("123-345-679-00000");
    expect(formatTin("123 345 679 00000")).toBe("123-345-679-00000");
    expect(formatTin("abc123def345")).toBe("123-345");
  });

  it("caps at 14 digits (9-digit TIN + 5-digit branch code)", () => {
    expect(formatTin("123345679000001234567")).toBe("123-345-679-00000");
  });

  it("returns an empty string for empty input", () => {
    expect(formatTin("")).toBe("");
  });
});
