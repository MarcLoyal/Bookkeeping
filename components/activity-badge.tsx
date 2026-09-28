import { ACTIVITY_HEALTH_CLASSES, ACTIVITY_HEALTH_LABELS, activityHealthFor } from "@/lib/activity-health";

export function ActivityBadge({ lastActiveAt }: { lastActiveAt: Date | string | null }) {
  const health = activityHealthFor(lastActiveAt);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTIVITY_HEALTH_CLASSES[health]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {ACTIVITY_HEALTH_LABELS[health]}
    </span>
  );
}
