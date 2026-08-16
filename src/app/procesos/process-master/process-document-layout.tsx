export function ProcessDocumentSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#dbe4eb] bg-white">
      <div className="w-full bg-navy px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-white sm:text-sm">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ProcessDocumentRow({ children, className = "", label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <div className={`grid min-w-0 sm:grid-cols-[9rem_minmax(0,1fr)] ${className}`}>
      <div className="bg-[#fbfcfd] px-4 pb-1 pt-3 sm:px-5 sm:py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-navy">{label}</p>
      </div>
      <div className="min-w-0 px-4 pb-3 pt-1 text-sm leading-6 text-slate-700 sm:px-5 sm:py-3">{children}</div>
    </div>
  );
}