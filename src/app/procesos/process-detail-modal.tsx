"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, LoaderCircle, Pencil, X } from "lucide-react";

import { ProcessMasterSheet } from "@/app/procesos/process-master/process-master-sheet";
import type { ProcessMasterDto } from "@/app/procesos/process-master/process-master-types";
import type {
  ProcessCatalogV2Item,
  ProcessStageV2Row,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";

type ProcessDetailLinkProps = {
  canEdit?: boolean;
  ownerRoleBySubprocess: Record<string, string>;
  process: ProcessCatalogV2Item;
  roleDictionary: RoleDictionaryItem[];
  stages: ProcessStageV2Row[];
};

type ProcessDetailResponse = {
  data?: ProcessMasterDto;
  error?: string;
};

export function ProcessDetailModal({ canEdit = false, process }: ProcessDetailLinkProps) {
  const [detail, setDetail] = useState<ProcessMasterDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function openDetail() {
    setOpen(true);
    if (detail || loading) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/estructura/procesos/${process.process_id}/ficha`, {
        cache: "no-store",
      });
      const payload = await response.json() as ProcessDetailResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "No se pudo cargar la ficha del proceso.");
      }
      setDetail(payload.data);
    } catch {
      setError("No se pudo cargar la ficha del proceso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        aria-label={`Ver ficha del proceso ${process.process_name}`}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#d6e1ea] bg-white px-3 text-xs font-medium text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
        onClick={(event) => {
          event.stopPropagation();
          void openDetail();
        }}
        title="Ver ficha"
        type="button"
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5" />
        Ver ficha
      </button>

      {open ? (
        <div
          aria-label={`Ficha del proceso ${process.process_name}`}
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-stretch justify-center bg-navy/45 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          role="dialog"
        >
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-[#f4f7fa] shadow-2xl sm:h-[calc(100dvh-2.5rem)] sm:rounded-lg sm:border sm:border-line">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">Ficha de proceso</p>
                <h2 className="truncate text-base font-bold text-navy sm:text-lg">{process.process_name}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit ? (
                  <Link
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-navy transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                    href={`/procesos/${process.process_id}/editar`}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4 text-sea" />
                    Editar
                  </Link>
                ) : null}
                <button
                  aria-label="Cerrar ficha"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-white text-navy transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 sm:px-5">
              {loading ? (
                <div className="flex min-h-56 items-center justify-center gap-3 text-sm font-medium text-navy" role="status">
                  <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-sea" />
                  Cargando ficha...
                </div>
              ) : null}
              {error ? (
                <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#fff4e8] px-4 py-3 text-sm font-medium text-[#86510d]" role="alert">
                  {error}
                </div>
              ) : null}
              {detail ? <ProcessMasterSheet mode="readonly" process={detail} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
