"use client";

import { useState } from "react";
import { Archive } from "lucide-react";

import { archiveProcess } from "@/app/admin/actions";

export function ArchiveProcessPanel({ processId }: { processId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="mt-5 rounded-lg border border-[#f0d2b8] bg-[#fff7ed] p-5 shadow-[0_10px_30px_rgba(0,59,92,0.04)]">
      <h2 className="text-xl font-bold text-[#9a4a16]">Zona administrativa</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9a4a16]">
        Archivar este proceso lo quitará del mapa y del listado activo. Sus etapas, roles, sistemas, riesgos y controles se conservan como historial.
      </p>
      <div className="mt-4">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f0c6a4] bg-[#fff7ed] px-4 py-2 text-sm font-bold text-[#9a4a16] transition hover:bg-[#ffedd5]"
          onClick={() => setConfirmOpen(true)}
          type="button"
        >
          <Archive className="h-4 w-4" />
          Archivar proceso
        </button>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm">
          <section
            aria-labelledby="archive-process-confirm-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            role="dialog"
          >
            <header className="border-b border-[#d6e1ea] px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a5b2d]">
                Zona administrativa
              </p>
              <h3 className="mt-1 text-lg font-medium text-navy" id="archive-process-confirm-title">
                Archivar proceso
              </h3>
            </header>
            <div className="grid gap-4 p-5">
              <p className="text-sm leading-6 text-slate-700">
                Este proceso dejará de aparecer en el mapa macro y en el listado de procesos activos. Sus etapas, roles asociados, sistemas, riesgos y controles se conservarán como historial. Esta acción no elimina definitivamente el proceso.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                  onClick={() => setConfirmOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <form action={archiveProcess}>
                  <input name="process_id" type="hidden" value={processId} />
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5d2bf] bg-[#fff8ef] px-4 py-2 text-sm font-medium text-[#8a5b2d] transition hover:border-[#d9b98f] hover:bg-[#fff3e2]"
                    type="submit"
                  >
                    <Archive className="h-4 w-4" />
                    Archivar proceso
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
