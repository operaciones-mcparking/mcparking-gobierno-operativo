export function Panel({
  action,
  children,
  count,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  count?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="px-5 pt-5">
          <h2 className="text-base font-medium tracking-tight text-navy">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          ) : null}
        </div>
        <div className="mx-5 mt-5 flex flex-wrap items-center gap-2 sm:ml-0">
          {count ? (
            <span className="w-fit rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
              {count}
            </span>
          ) : null}
          {action}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}
