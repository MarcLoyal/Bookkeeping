import { describe, expect, it } from "vitest";
import { getPlanLimits, PLAN_DEFAULTS, TRIAL_DURATION_DAYS } from "../billing/plan-limits";

describe("PLAN_DEFAULTS", () => {
  it("matches the agreed plan structure", () => {
    expect(PLAN_DEFAULTS.free).toEqual({ maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false });
    expect(PLAN_DEFAULTS.trial).toEqual({ maxClients: 10, maxUsers: 5, perClientAssignmentAllowed: true });
    expect(PLAN_DEFAULTS.basic).toEqual({ maxClients: 10, maxUsers: 2, perClientAssignmentAllowed: false });
    expect(PLAN_DEFAULTS.premium).toEqual({ maxClients: 30, maxUsers: 10, perClientAssignmentAllowed: true });
  });

  it("trial is 7 days", () => {
    expect(TRIAL_DURATION_DAYS).toBe(7);
  });
});

describe("getPlanLimits()", () => {
  it("reads the numbers directly off the firm row, not off a plan lookup table", () => {
    // Deliberately mismatched from PLAN_DEFAULTS.basic — proves this
    // reads the row's own columns (what an enterprise firm's custom
    // limits actually need), not a plan-name-keyed table.
    const firm = { plan: "basic" as const, maxClients: 999, maxUsers: 999, perClientAssignmentAllowed: true };
    expect(getPlanLimits(firm)).toEqual({ maxClients: 999, maxUsers: 999, perClientAssignmentAllowed: true });
  });

  it("an enterprise firm's custom limits pass through untouched", () => {
    const firm = { plan: "enterprise" as const, maxClients: 250, maxUsers: 60, perClientAssignmentAllowed: true };
    expect(getPlanLimits(firm)).toEqual({ maxClients: 250, maxUsers: 60, perClientAssignmentAllowed: true });
  });
});
