"use client";

import { useActionState, useState, useTransition } from "react";
import type { ExpiredTrialFirmRow } from "@/lib/data/platform-billing";
import type { DowngradePreview } from "@/lib/billing/downgrade-firm-to-free";
import { PLAN_LABELS, type FirmPlan } from "@/lib/billing/plan-limits";
import {
  changePlanAction,
  downgradeFirmAction,
  extendTrialAction,
  initialFormState,
  previewDowngradeAction,
} from "./actions";

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * "Downgrade to Free" — a two-step preview/confirm, not a plain confirm()
 * dialog: which 3 clients stay active depends on real view-history data
 * (see previewDowngradeFirmToFree()), so a static confirm message couldn't
 * actually tell you what's about to happen. Both steps call Server Actions
 * directly (not as <form action>), since the preview needs to hand back a
 * whole object, not just an {error, success} state.
 */
function DowngradeAction({ firmId }: { firmId: string }) {
  const [preview, setPreview] = useState<DowngradePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <p className="text-sm text-emerald-700">Downgraded to Free.</p>;
  }

  if (!preview) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setPreview(await previewDowngradeAction(firmId)))}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {pending ? "Loading preview..." : "Downgrade to Free"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!preview.ok) {
    return <p className="text-sm text-red-600">{preview.error}</p>;
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-900">This will:</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-red-800">
        <li>
          Keep active: {preview.clientsToKeepActive.length > 0 ? preview.clientsToKeepActive.map((c) => c.name).join(", ") : "(no clients)"}
        </li>
        <li>
          Make read-only: {preview.clientsToMakeReadOnly.length > 0 ? preview.clientsToMakeReadOnly.map((c) => c.name).join(", ") : "(none)"}
        </li>
        <li>
          Deactivate staff: {preview.staffToDeactivate.length > 0 ? preview.staffToDeactivate.map((s) => `${s.name} (${s.role})`).join(", ") : "(none)"}
        </li>
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await downgradeFirmAction(firmId);
              if (!result.ok) setError(result.error);
              else setDone(true);
            })
          }
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Working..." : "Confirm downgrade"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setPreview(null)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ExtendTrialForm({ firmId }: { firmId: string }) {
  const [state, formAction, pending] = useActionState(extendTrialAction, initialFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="firmId" value={firmId} />
      <div>
        <label className="block text-xs font-medium text-slate-700">Extend by (days)</label>
        <input
          type="number"
          name="days"
          min={1}
          max={365}
          defaultValue={7}
          required
          className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Extending..." : "Extend trial"}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-emerald-700">Trial extended.</p>}
    </form>
  );
}

const MANUAL_PLANS: Exclude<FirmPlan, "trial" | "free">[] = ["basic", "premium", "enterprise"];

function ChangePlanForm({ firmId }: { firmId: string }) {
  const [state, formAction, pending] = useActionState(changePlanAction, initialFormState);
  const [plan, setPlan] = useState<(typeof MANUAL_PLANS)[number]>("basic");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="firmId" value={firmId} />
      <div>
        <label className="block text-xs font-medium text-slate-700">Plan</label>
        <select
          name="plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as (typeof MANUAL_PLANS)[number])}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {MANUAL_PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {plan === "enterprise" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-700">Max clients</label>
            <input
              type="number"
              name="maxClients"
              min={1}
              required
              className="mt-1 w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Max users</label>
            <input
              type="number"
              name="maxUsers"
              min={1}
              required
              className="mt-1 w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input type="checkbox" name="perClientAssignmentAllowed" value="true" defaultChecked />
            Per-client assignment
          </label>
        </>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Changing..." : "Change plan"}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-emerald-700">Plan changed.</p>}
    </form>
  );
}

export function ExpiredTrialRow({ firm }: { firm: ExpiredTrialFirmRow }) {
  const [panel, setPanel] = useState<null | "downgrade" | "extend" | "plan">(null);

  function toggle(next: "downgrade" | "extend" | "plan") {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-slate-900">{firm.name}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {firm.ownerName ?? "No owner"}
            {firm.ownerEmail && ` · ${firm.ownerEmail}`} · Currently {PLAN_LABELS[firm.plan]} · Flagged {daysSince(firm.trialExpiredFlaggedAt)}d ago
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle("downgrade")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${panel === "downgrade" ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
          >
            Downgrade to Free
          </button>
          <button
            type="button"
            onClick={() => toggle("extend")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${panel === "extend" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
          >
            Extend trial
          </button>
          <button
            type="button"
            onClick={() => toggle("plan")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${panel === "plan" ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
          >
            Change plan
          </button>
        </div>
      </div>

      {panel === "downgrade" && (
        <div className="mt-3">
          <DowngradeAction firmId={firm.id} />
        </div>
      )}
      {panel === "extend" && (
        <div className="mt-3">
          <ExtendTrialForm firmId={firm.id} />
        </div>
      )}
      {panel === "plan" && (
        <div className="mt-3">
          <ChangePlanForm firmId={firm.id} />
        </div>
      )}
    </li>
  );
}
