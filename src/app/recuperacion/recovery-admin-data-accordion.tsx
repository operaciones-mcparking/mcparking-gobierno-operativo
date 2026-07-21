"use client";

import { useState, type ReactNode } from "react";

import { ValueBadge } from "@/components/dashboard/badge";

type RecoveryAdminDataAccordionProps = {
  children: ReactNode;
};

export function RecoveryAdminDataAccordion({ children }: RecoveryAdminDataAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#fbfdfe]"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Administracion de datos</h2>
            <ValueBadge tone="info">Admin</ValueBadge>
          </div>
          <p className="mt-1 text-sm text-slate-600">Cargas CSV, ultimos batches e historial de importaciones.</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6e1ea] bg-white text-lg text-navy transition">
          {isOpen ? "-" : "+"}
        </span>
      </button>

      {isOpen ? <div className="border-t border-[#edf2f6] px-5 pb-5 pt-1">{children}</div> : null}
    </section>
  );
}