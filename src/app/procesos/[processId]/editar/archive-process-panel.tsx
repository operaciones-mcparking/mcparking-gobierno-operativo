"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronRight, Settings, Trash2, X } from "lucide-react";

import { archiveProcess, deleteProcessPermanently } from "@/app/admin/actions";

const PERMANENT_DELETE_CONFIRMATION = "CONFIRMAR";

function DeleteSubmitButton({ enabled, pending }: { enabled: boolean; pending: boolean }) {
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#a63232] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#8f2929] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={!enabled || pending}
      type="submit"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {pending ? "Eliminando..." : "Eliminar definitivamente"}
    </button>
  );
}

export function ArchiveProcessPanel({
  canArchive,
  processId,
  processName,
}: {
  canArchive: boolean;
  processId: string;
  processName: string;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleteInFlightRef = useRef(false);
  const router = useRouter();

  async function handlePermanentDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteInFlightRef.current || confirmationText !== PERMANENT_DELETE_CONFIRMATION) return;

    deleteInFlightRef.current = true;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await deleteProcessPermanently(new FormData(event.currentTarget));
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      setConfirmationText("");
      router.replace("/estructura#procesos");
    } catch {
      setDeleteError("No se pudo eliminar definitivamente el proceso.");
    } finally {
      deleteInFlightRef.current = false;
      setDeletePending(false);
    }
  }

  useEffect(() => {
    if (!deleteOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeleteOpen(false);
        setConfirmationText("");
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [deleteOpen]);

  return (
    <section className="mt-6 border-t border-line pt-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-2 text-sm font-semibold text-slate-500 transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea">
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span>Zona administrativa</span>
          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        </summary>
        <div className="mt-3 rounded-lg border border-[#ecd8c5] bg-[#fffaf5] p-4">
          <p className="max-w-3xl text-sm leading-6 text-[#81502d]">
            Archivar conserva el historial. Eliminar definitivamente borra el proceso y sus relaciones propias de forma irreversible.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canArchive ? (
              <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[#e4c8ad] bg-white px-3.5 py-2 text-sm font-semibold text-[#81502d] transition hover:bg-[#fff3e6]" onClick={() => setArchiveOpen(true)} type="button">
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archivar proceso
              </button>
            ) : null}
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[#e0b7b7] bg-white px-3.5 py-2 text-sm font-semibold text-[#9a3030] transition hover:bg-[#fff4f4]" onClick={() => { setDeleteError(null); setDeleteOpen(true); }} type="button">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Eliminar definitivamente
            </button>
          </div>
        </div>
      </details>

      {archiveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm">
          <section aria-labelledby="archive-process-confirm-title" aria-modal="true" className="w-full max-w-md rounded-xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]" role="dialog">
            <header className="border-b border-[#d6e1ea] px-5 py-4">
              <p className="text-[11px] font-medium uppercase text-[#8a5b2d]">Zona administrativa</p>
              <h3 className="mt-1 text-lg font-medium text-navy" id="archive-process-confirm-title">Archivar proceso</h3>
            </header>
            <div className="grid gap-4 p-5">
              <p className="text-sm leading-6 text-slate-700">El proceso dejará de aparecer en el listado activo, pero sus relaciones se conservarán como historial.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy" onClick={() => setArchiveOpen(false)} type="button">Cancelar</button>
                <form action={archiveProcess}>
                  <input name="process_id" type="hidden" value={processId} />
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#e5d2bf] bg-[#fff8ef] px-4 py-2 text-sm font-medium text-[#8a5b2d]" type="submit"><Archive className="h-4 w-4" aria-hidden="true" />Archivar proceso</button>
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/35 px-4 py-6 backdrop-blur-sm">
          <section aria-labelledby="delete-process-confirm-title" aria-modal="true" className="w-full max-w-lg rounded-xl border border-[#e2bcbc] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]" role="dialog">
            <header className="flex items-start gap-3 border-b border-[#ead4d4] px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase text-[#a63232]">Accion irreversible</p>
                <h3 className="mt-1 text-lg font-semibold text-navy" id="delete-process-confirm-title">Eliminar proceso definitivamente</h3>
              </div>
              <button aria-label="Cerrar confirmacion de eliminacion" className="rounded-md p-2 text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea" onClick={() => { setDeleteOpen(false); setConfirmationText(""); setDeleteError(null); }} type="button"><X className="h-4 w-4" aria-hidden="true" /></button>
            </header>
            <form className="grid gap-4 p-5" onSubmit={handlePermanentDelete}>
              <input name="process_id" type="hidden" value={processId} />
              <p className="text-sm leading-6 text-slate-700">Esta acción eliminará permanentemente el proceso y toda su documentación asociada. No se puede deshacer.</p>
              <p className="text-sm text-slate-700">Proceso: <strong className="break-words text-navy">{processName}</strong></p>
              <label className="grid gap-1.5 text-sm font-medium text-navy">
                Para confirmar, escribe: <strong>{PERMANENT_DELETE_CONFIRMATION}</strong>
                <input autoComplete="off" className="min-h-10 rounded-md border border-[#d7b3b3] px-3 py-2 text-sm outline-none focus:border-[#a63232] focus:ring-2 focus:ring-[#f4dada]" name="confirmation_text" onChange={(event) => setConfirmationText(event.target.value)} value={confirmationText} />
              </label>
              {deleteError ? <p className="text-sm font-medium text-[#a63232]" role="alert">{deleteError}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button className="min-h-10 rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy" onClick={() => { setDeleteOpen(false); setConfirmationText(""); setDeleteError(null); }} type="button">Cancelar</button>
                <DeleteSubmitButton enabled={confirmationText === PERMANENT_DELETE_CONFIRMATION} pending={deletePending} />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
