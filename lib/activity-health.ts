export type ActivityHealth = "active" | "quiet" | "dormant" | "never";

/**
 * Shared by the platform admin dashboard (per-firm, from last LOGIN) and
 * the bookkeeper dashboard (per-client, from the most recent journal
 * entry) — same three-tier read on "how long since something happened
 * here," just fed a different timestamp.
 */
export function activityHealthFor(lastActiveAt: Date | string | null, now: Date = new Date()): ActivityHealth {
  if (!lastActiveAt) return "never";
  const days = (now.getTime() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return "active";
  if (days <= 14) return "quiet";
  return "dormant";
}

export const ACTIVITY_HEALTH_LABELS: Record<ActivityHealth, string> = {
  active: "Active",
  quiet: "Quiet",
  dormant: "Dormant",
  never: "Never active",
};

export const ACTIVITY_HEALTH_CLASSES: Record<ActivityHealth, string> = {
  active: "bg-emerald-50 text-emerald-700",
  quiet: "bg-amber-50 text-amber-700",
  dormant: "bg-red-50 text-red-700",
  never: "bg-slate-100 text-slate-500",
};
