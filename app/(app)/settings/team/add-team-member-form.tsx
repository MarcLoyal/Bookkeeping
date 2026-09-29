"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addTeamMemberAction, type AddTeamMemberActionState } from "./actions";

const initialState: AddTeamMemberActionState = { error: null, success: false };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "firm_admin", label: "Owner" },
  { value: "bookkeeper", label: "Bookkeeper" },
  { value: "reviewer", label: "Reviewer" },
  { value: "encoder", label: "Encoder" },
  { value: "viewer", label: "Viewer" },
];

export function AddTeamMemberForm({
  isOwner,
  clients,
}: {
  isOwner: boolean;
  clients: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(addTeamMemberAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState(isOwner ? "bookkeeper" : "encoder");

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  // Owner's account itself has no client scoping, so client assignment is
  // only meaningful once they're inviting a client-scoped role. A
  // Bookkeeper's invite is always client-scoped (see createTeamMember).
  const showClientPicker = role !== "firm_admin";

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className="mt-1 w-64 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-slate-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="off"
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-xs font-medium text-slate-700">
            Role
          </label>
          {isOwner ? (
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="role" value="encoder" />
              <p className="mt-1 flex h-[38px] w-40 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                Encoder
              </p>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Sending invite..." : "Add team member"}
        </button>
      </div>

      {showClientPicker && (
        <div>
          <p className="text-xs font-medium text-slate-700">
            {isOwner ? "Assign to specific clients (leave blank for access to every client)" : "Assign to clients (required)"}
          </p>
          {clients.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">No clients available to assign.</p>
          ) : (
            <div className="mt-1 flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {clients.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" name="clientIds" value={c.id} className="rounded border-slate-300" />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-emerald-700">Invite sent — they&apos;ll get an email to set their password and sign in.</p>
      )}
    </form>
  );
}
