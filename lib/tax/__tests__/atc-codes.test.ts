import { describe, expect, it } from "vitest";
import { describeAtc } from "../atc-codes";

describe("describeAtc", () => {
  it("describes a known code case-insensitively", () => {
    expect(describeAtc("wi010")).toBe("Professional fees (lawyers, CPAs, engineers, etc.) — gross income ≤ ₱3M (5%)");
  });

  it("returns null for an unrecognized code", () => {
    expect(describeAtc("ZZ999")).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(describeAtc(null)).toBeNull();
    expect(describeAtc(undefined)).toBeNull();
    expect(describeAtc("")).toBeNull();
  });
});
