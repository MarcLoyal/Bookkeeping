"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100"
    >
      Print / Save PDF
    </button>
  );
}
