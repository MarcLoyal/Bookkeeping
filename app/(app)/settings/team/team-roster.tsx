"use client";

import { useActionState, useEffect, useState } from "react";
import { editAssignmentsAction, setActiveAction, type EditAssignmentsActionState, type SetActiveActionState } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Owner",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  encoder: "Encoder",
  viewer: "Viewer",
  client_user: "Client",
};

export type TeamMemberForRoster = {
  id: string;
  email: string;
  name: string;
  role: string;
  accessScope: string;
  active: boolean;
  assignedClients: { id: string; name: string }[];
};

const editInitialState: EditAssignmentsActionState = { error: null, success: false };
const activeInitialState: SetActiveActionState = { error: null, success: false, warning: null };

function ClientsCell({ member }: { member: TeamMemberForRoster }) {
  if (member.accessScope === "all") return <span className="text-slate-600">Every client</span>;
  if (member.assignedClients.length === 0) return <span className="text-slate-400">None</span>;
  return <span className="text-slate-600">{member.assignedClients.map((c) => c.name).join(", ")}</span>;
}

function EditAssignmentsPanel({
  member,
  isOwner,
  allClients,
  onDone,
}: {
  member: TeamMemberForRoster;
  isOwner: boolean;
  allClients: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(editAssignmentsAction, editInitialState);
  const assignedIds = new Set(member.assignedClients.map((c) => c.id));
  const [scope, setScope] = useState(member.accessScope);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="targetUserId" value={member.id} />
      {isOwner && (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="accessScope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
            All clients
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="accessScope" value="assigned" checked={scope === "assigned"} onChange={() => setScope("assigned")} />
            Specific clients
          </label>
        </div>
      )}
      {(!isOwner || scope === "assigned") && (
        <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
          {allClients.length === 0 ? (
            <p className="text-sm text-slate-500">No clients available to assign.</p>
          ) : (
            allClients.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" name="clientIds" value={c.id} defaultChecked={assignedIds.has(c.id)} className="rounded border-slate-300" />
                {c.name}
              </label>
            ))
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Saving..." : "Save assignments"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
          Cancel
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function DeactivateButton({ member }: { member: TeamMemberForRoster }) {
  const [state, formAction, pending] = useActionState(setActiveAction, activeInitialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (member.active && !window.confirm(`Deactivate ${member.name}? They will not be able to sign in.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="targetUserId" value={member.id} />
      <input type="hidden" name="active" value={member.active ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
          member.active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {pending ? "Working..." : member.active ? "Deactivate" : "Reactivate"}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      {state.success && state.warning && <p className="mt-1 text-xs text-amber-700">{state.warning}</p>}
    </form>
  );
}

function TeamMemberRow({
  member,
  currentUserId,
  isOwner,
  allClients,
}: {
  member: TeamMemberForRoster;
  currentUserId: string;
  isOwner: boolean;
  allClients: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = isOwner || member.role === "encoder";
  const canDeactivate = canEdit && member.id !== currentUserId;

  return (
    <>
      <tr>
        <td className="px-4 py-2">
          {member.name}
          {member.id === currentUserId && <span className="ml-1 text-xs text-slate-400">(you)</span>}
        </td>
        <td className="px-4 py-2 text-slate-600">{member.email}</td>
        <td className="px-4 py-2">{ROLE_LABELS[member.role] ?? member.role}</td>
        <td className="px-4 py-2">
          <ClientsCell member={member} />
        </td>
        <td className="px-4 py-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              member.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {member.active ? "Active" : "Deactivated"}
          </span>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100">
                {editing ? "Close" : "Edit"}
              </button>
            )}
            {canDeactivate && <DeactivateButton member={member} />}
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <EditAssignmentsPanel member={member} isOwner={isOwner} allClients={allClients} onDone={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

export function TeamRoster({
  members,
  currentUserId,
  isOwner,
  allClients,
}: {
  members: TeamMemberForRoster[];
  currentUserId: string;
  isOwner: boolean;
  allClients: { id: string; name: string }[];
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Clients</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map((m) => (
            <TeamMemberRow key={m.id} member={m} currentUserId={currentUserId} isOwner={isOwner} allClients={allClients} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
