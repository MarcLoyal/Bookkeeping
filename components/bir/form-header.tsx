export function BirFormHeader({
  formNo,
  revision,
  pageLabel,
  title,
}: {
  formNo: string;
  revision: string;
  pageLabel: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2">
      <div className="text-[10px] leading-tight">
        <div className="font-semibold">Republic of the Philippines</div>
        <div>Department of Finance</div>
        <div>Bureau of Internal Revenue</div>
      </div>
      <div className="text-center">
        <div className="text-[10px]">BIR Form No.</div>
        <div className="text-2xl font-bold leading-none">{formNo}</div>
        <div className="text-[9px] text-slate-600">{revision}</div>
        <div className="text-[9px] text-slate-600">{pageLabel}</div>
      </div>
      <div className="max-w-xs text-right">
        <div className="text-sm font-bold">{title}</div>
      </div>
    </div>
  );
}

export function BirFormNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[9px] italic text-slate-600">{children}</p>;
}

export function BirPartTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 border-y border-slate-900 bg-slate-100 py-1 text-center text-[11px] font-bold">{children}</div>;
}

/** One numbered line/field: the small superscript-style item number, a label, and boxed value on the right. */
export function BirLine({
  no,
  label,
  sub,
  children,
}: {
  no?: string;
  label: React.ReactNode;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-300 py-1 text-[10px]">
      <div className="flex-1">
        {no && <span className="mr-1 font-bold">{no}</span>}
        <span>{label}</span>
        {sub && <div className="text-[9px] italic text-slate-500">{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
